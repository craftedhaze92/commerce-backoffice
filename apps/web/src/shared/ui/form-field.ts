/**
 * 폼 입력칸 공통 스타일.
 *
 * 여러 레이어의 폼(entities, widgets 등)이 같은 시안 스펙을 쓴다. 레이어끼리는 서로
 * import할 수 없어서, 각자 문자열을 들고 있으면 한쪽만 고쳐져 입력칸 모양이 갈라진다.
 *
 * Shadcn `Input`·`SelectTrigger`의 기본 스타일 위에 cn()으로 덮어쓴다.
 */

/** 입력 필드 스펙: 15px, radius 12px, 테두리 없는 회색 채움, 포커스 시 흰 바탕과 브랜드 컬러 테두리 */
export const FORM_FIELD =
  'bg-canvas hover:bg-track focus-visible:bg-card focus-visible:border-brand h-10 rounded-lg border border-transparent px-3.5 text-[15px] font-medium focus-visible:ring-0';

/** 라벨과 입력칸을 세로로 쌓는 래퍼. 라벨 글자는 작고 흐리게 둔다 */
export const FORM_LABEL = 'text-muted-strong flex flex-col gap-1.5 text-[13px] font-semibold';
