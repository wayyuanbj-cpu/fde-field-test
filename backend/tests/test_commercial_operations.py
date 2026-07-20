import json
import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone

from fde_commercial import manage
from fde_commercial.applications import create_application
from fde_commercial.db import connect, initialize
from fde_commercial.operations import (
    CohortFullError,
    InvalidTransitionError,
    ValidationError,
    assign_application,
    create_cohort,
    enroll_application,
    transition_application,
)


def application_payload(index):
    return {
        "product_code": "FDE-TRAINING-SMALL-CLASS",
        "offer_id": "fde-small-class-open-application",
        "name": f"申请人{index}",
        "mobile": f"1380000{index:04d}",
        "wechat": "",
        "current_role": "产品经理",
        "ai_experience": "practitioner",
        "fde_experience": "参与过企业数字化项目",
        "learning_goal": "建立完整企业 AI 交付能力",
        "time_commitment": "每周 10 小时",
        "source": "community",
        "consent_version": "training-application-v1",
        "_company": "",
    }


class CommercialOperationsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        self.now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)
        initialize(self.conn, self.now)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def create_application(self, index):
        created = create_application(
            self.conn,
            application_payload(index),
            f"operations-{index}",
            self.now,
        )
        return self.conn.execute(
            "SELECT id FROM training_applications WHERE public_id = ?",
            (created["public_id"],),
        ).fetchone()[0]

    def test_valid_application_transition_path_is_explicit_and_audited(self):
        application_id = self.create_application(1)
        expected = ["reviewing", "contacted", "qualified", "waitlisted", "admitted"]
        for status in expected:
            changed = transition_application(
                self.conn,
                application_id,
                status,
                None,
                "operator:1",
                self.now,
            )
            self.assertEqual(changed["status"], status)

        with self.assertRaises(InvalidTransitionError):
            transition_application(
                self.conn,
                application_id,
                "reviewing",
                None,
                "operator:1",
                self.now,
            )

        events = self.conn.execute(
            """
            SELECT actor, action, before_json, after_json
            FROM commercial_audit_events
            WHERE action = 'training_application.transitioned'
            ORDER BY id
            """
        ).fetchall()
        self.assertEqual(len(events), len(expected))
        self.assertEqual(events[-1]["actor"], "operator:1")
        self.assertEqual(json.loads(events[-1]["before_json"])["status"], "waitlisted")
        self.assertEqual(json.loads(events[-1]["after_json"])["status"], "admitted")

    def test_terminal_application_statuses_require_a_reason(self):
        for index, status in enumerate(("rejected", "withdrawn", "closed"), start=2):
            application_id = self.create_application(index)
            with self.subTest(status=status):
                with self.assertRaises(ValidationError):
                    transition_application(
                        self.conn,
                        application_id,
                        status,
                        None,
                        "operator:1",
                        self.now,
                    )
                changed = transition_application(
                    self.conn,
                    application_id,
                    status,
                    "当前时间安排不匹配",
                    "operator:1",
                    self.now,
                )
                self.assertEqual(changed["status"], status)
                self.assertEqual(changed["status_reason"], "当前时间安排不匹配")

    def test_assignment_requires_operator_and_is_audited(self):
        application_id = self.create_application(5)
        with self.assertRaises(ValidationError):
            assign_application(self.conn, application_id, "", "owner:1", self.now)
        changed = assign_application(
            self.conn,
            application_id,
            "operator:7",
            "owner:1",
            self.now,
        )
        self.assertEqual(changed["assigned_operator_id"], "operator:7")
        event = self.conn.execute(
            """
            SELECT * FROM commercial_audit_events
            WHERE action = 'training_application.assigned'
            """
        ).fetchone()
        self.assertEqual(event["actor"], "owner:1")

    def admit_application(self, index):
        application_id = self.create_application(index)
        for status in ("reviewing", "contacted", "qualified", "admitted"):
            transition_application(
                self.conn,
                application_id,
                status,
                None,
                "operator:1",
                self.now,
            )
        return application_id

    def test_cohort_capacity_cannot_exceed_ten(self):
        for capacity in (0, 11):
            with self.subTest(capacity=capacity):
                with self.assertRaises(ValidationError):
                    create_cohort(
                        self.conn,
                        {"name": "不合规班期", "capacity": capacity},
                        "owner:1",
                        self.now,
                    )

        cohort = create_cohort(
            self.conn,
            {"name": "首期", "capacity": 10},
            "owner:1",
            self.now,
        )
        self.assertEqual(cohort["capacity"], 10)
        self.assertEqual(cohort["status"], "planning")
        self.assertIsNone(cohort["starts_at"])
        self.assertIsNone(cohort["ends_at"])

    def test_eleventh_confirmed_enrollment_is_rejected(self):
        application_ids = [self.admit_application(index) for index in range(10, 21)]
        cohort = create_cohort(
            self.conn,
            {"name": "首期", "capacity": 10},
            "owner:1",
            self.now,
        )
        seats = []
        for application_id in application_ids[:10]:
            enrollment = enroll_application(
                self.conn,
                application_id,
                cohort["id"],
                "operator:1",
                self.now,
            )
            seats.append(enrollment["seat_number"])
        self.assertEqual(seats, list(range(1, 11)))
        with self.assertRaises(CohortFullError):
            enroll_application(
                self.conn,
                application_ids[10],
                cohort["id"],
                "operator:1",
                self.now,
            )

        stored_cohort = self.conn.execute(
            "SELECT * FROM training_cohorts WHERE id = ?", (cohort["id"],)
        ).fetchone()
        self.assertEqual(stored_cohort["confirmed_count"], 10)
        self.assertEqual(stored_cohort["status"], "full")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM training_enrollments").fetchone()[0],
            10,
        )
        eleventh = self.conn.execute(
            "SELECT status FROM training_applications WHERE id = ?",
            (application_ids[10],),
        ).fetchone()
        self.assertEqual(eleventh["status"], "admitted")

    def test_only_admitted_application_can_be_enrolled(self):
        application_id = self.create_application(30)
        cohort = create_cohort(
            self.conn,
            {"name": "首期", "capacity": 10},
            "owner:1",
            self.now,
        )
        with self.assertRaises(ValidationError):
            enroll_application(
                self.conn,
                application_id,
                cohort["id"],
                "operator:1",
                self.now,
            )

    def run_manage(self, *arguments):
        output = io.StringIO()
        errors = io.StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            result = manage.main(["--db", self.temp.name, *arguments])
        self.assertEqual(result, 0)
        return output.getvalue()

    def test_management_list_masks_private_fields_by_default(self):
        application_id = self.create_application(40)
        self.conn.execute(
            "UPDATE training_applications SET wechat = ? WHERE id = ?",
            ("fde-private-wechat", application_id),
        )
        self.conn.commit()

        output = self.run_manage("list-applications")

        self.assertIn("138****0040", output)
        self.assertNotIn("13800000040", output)
        self.assertNotIn("fde-private-wechat", output)

    def test_private_list_requires_actor_and_writes_audit(self):
        application_id = self.create_application(41)
        with self.assertRaises(SystemExit):
            self.run_manage("list-applications", "--show-private")

        output = self.run_manage(
            "list-applications",
            "--show-private",
            "--actor",
            "auditor:1",
        )
        self.assertIn("13800000041", output)
        event = self.conn.execute(
            """
            SELECT actor, action, object_id
            FROM commercial_audit_events
            WHERE action = 'training_application.private_list_viewed'
            """
        ).fetchone()
        self.assertEqual(event["actor"], "auditor:1")
        self.assertEqual(event["object_id"], "list")

    def test_mutating_cli_commands_require_actor(self):
        application_id = self.create_application(42)
        with self.assertRaises(SystemExit):
            self.run_manage(
                "assign",
                str(application_id),
                "--operator-id",
                "operator:9",
            )
        unchanged = self.conn.execute(
            "SELECT assigned_operator_id FROM training_applications WHERE id = ?",
            (application_id,),
        ).fetchone()
        self.assertIsNone(unchanged["assigned_operator_id"])

        output = self.run_manage(
            "assign",
            str(application_id),
            "--operator-id",
            "operator:9",
            "--actor",
            "owner:1",
        )
        self.assertIn('"assigned_operator_id": "operator:9"', output)

    def test_cohort_cli_round_trip(self):
        application_id = self.admit_application(43)
        cohort_output = self.run_manage(
            "create-cohort",
            "--name",
            "CLI 首期",
            "--capacity",
            "10",
            "--actor",
            "owner:1",
        )
        cohort_id = json.loads(cohort_output)["id"]
        enrollment_output = self.run_manage(
            "enroll",
            str(application_id),
            "--cohort-id",
            str(cohort_id),
            "--actor",
            "operator:1",
        )
        self.assertEqual(json.loads(enrollment_output)["seat_number"], 1)
        cohorts = self.run_manage("list-cohorts")
        self.assertIn("CLI 首期", cohorts)
        audit = self.run_manage("show-audit", "--limit", "5")
        self.assertIn("training_enrollment.created", audit)


if __name__ == "__main__":
    unittest.main()
