const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const STATUS_LABELS = {
  member: '人才库成员',
  cert_pending: '认证审核中',
  certified: 'OneX 认证 FDE',
  delivery: 'OneX 交付 FDE',
};

const SERVICE_MODE_LABELS = {
  remote: '远程协作',
  onsite: '驻场协作',
  hybrid: '混合协作',
};

const AVAILABILITY_LABELS = {
  available: '可对接',
  limited: '排期有限',
  unavailable: '暂不可用',
};

export function profilePath(slug) {
  const normalized = String(slug ?? '').trim();
  return SLUG.test(normalized) ? `/talents/${normalized}/` : '';
}

export function profileSlug(pathname) {
  const match = String(pathname ?? '').match(/^\/talents\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match?.[1] ?? '';
}

export function presentTalent(talent) {
  const status = STATUS_LABELS[talent?.status] ? talent.status : 'member';
  return {
    slug: SLUG.test(String(talent?.slug ?? '')) ? talent.slug : '',
    statusLabel: STATUS_LABELS[status],
    certificationLabel: String(talent?.certification_label || '尚未完成 OneX 认证'),
    serviceModeLabel: SERVICE_MODE_LABELS[talent?.service_mode] ?? '服务方式待确认',
    availabilityLabel: AVAILABILITY_LABELS[talent?.availability] ?? '档期待确认',
    isCertified: status === 'certified' || status === 'delivery',
  };
}
