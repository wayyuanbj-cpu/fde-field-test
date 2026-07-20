"""Explicit commercial integration boundary for future external systems."""

from __future__ import annotations

from typing import Protocol


class CommercialAdapter(Protocol):
    def sync_lead(self, application: dict) -> str | None: ...

    def sync_opportunity(self, opportunity: dict) -> str | None: ...

    def get_contract_status(self, external_id: str) -> str | None: ...

    def get_payment_status(self, external_id: str) -> str | None: ...


class LocalCommercialAdapter:
    """Keep records local without implying an external integration exists."""

    mode = "local"

    def sync_lead(self, application: dict) -> str:
        return f"local:{application['public_id']}"

    def sync_opportunity(self, opportunity: dict) -> str:
        return f"local:opportunity:{opportunity['id']}"

    def get_contract_status(self, external_id: str) -> None:
        return None

    def get_payment_status(self, external_id: str) -> None:
        return None

