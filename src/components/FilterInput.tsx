import type { FilterDraft } from '../filters'

type Props = {
  column: string
  isDate: boolean
  draft: FilterDraft
  onChange: (draft: FilterDraft) => void
}

// Input for one filterable column
export default function FilterInput({ column, isDate, draft, onChange }: Props) {
  return (
    <label className="field">
      <span>{column}</span>
      {isDate ? (
        <span className="date-range">
          <input
            type="date"
            value={draft.from}
            onChange={(e) => onChange({ ...draft, from: e.target.value })}
          />
          至
          <input
            type="date"
            value={draft.to}
            onChange={(e) => onChange({ ...draft, to: e.target.value })}
          />
        </span>
      ) : (
        <input
          type="text"
          placeholder="单个值，或用逗号分隔多个值"
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
        />
      )}
    </label>
  )
}
