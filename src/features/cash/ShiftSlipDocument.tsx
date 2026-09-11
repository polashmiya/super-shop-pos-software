/* Shift report on receipt paper (X / Z slip). Black on white, printed via the receipt CSS. */

export interface SlipLine {
  label: string;
  value: string;
  strong?: boolean;
}

export interface SlipSection {
  title: string;
  lines: SlipLine[];
}

export interface ShiftSlipProps {
  storeName: string;
  title: string;
  meta: SlipLine[];
  sections: SlipSection[];
  note: string | null;
  noteLabel: string;
  signatures: string[];
  printedAt: string;
}

const ROW = { display: 'flex', justifyContent: 'space-between', gap: 8 } as const;

function Rule() {
  return <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />;
}

export function ShiftSlipDocument({ storeName, title, meta, sections, note, noteLabel, signatures, printedAt }: ShiftSlipProps) {
  return (
    <div className="receipt">
      <div className="c">
        <div className="store">{storeName}</div>
        <div className="strong" style={{ margin: '4px 0' }}>
          {title}
        </div>
      </div>
      <Rule />
      {meta.map((line) => (
        <div key={line.label} style={ROW} className="sub">
          <span>{line.label}</span>
          <span className="num">{line.value}</span>
        </div>
      ))}
      {sections.map((section) => (
        <div key={section.title}>
          <Rule />
          <div className="strong" style={{ marginBottom: 2 }}>
            {section.title}
          </div>
          {section.lines.map((line, index) => (
            <div key={`${line.label}-${index}`} style={{ ...ROW, fontWeight: line.strong ? 700 : 400 }}>
              <span>{line.label}</span>
              <span className="num">{line.value}</span>
            </div>
          ))}
        </div>
      ))}
      {note && (
        <>
          <Rule />
          <div className="sub">
            <span className="strong">{noteLabel}: </span>
            {note}
          </div>
        </>
      )}
      <Rule />
      {signatures.map((label) => (
        <div key={label} style={{ marginTop: 22 }}>
          <div style={{ borderTop: '1px solid #000', width: '70%' }} />
          <div className="sub">{label}</div>
        </div>
      ))}
      <div className="c sub" style={{ marginTop: 10 }}>
        {printedAt}
      </div>
    </div>
  );
}
