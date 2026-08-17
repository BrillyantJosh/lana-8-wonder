import { Leaf, RefreshCw, ShieldCheck, Users } from "lucide-react";

type MarkProps = {
  className?: string;
  title?: string;
};

export const LanaMark = ({ className = "", title = "Lana8Wonder" }: MarkProps) => (
  <svg
    className={className}
    viewBox="0 0 72 84"
    role="img"
    aria-label={title}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="lana-mark-gold" x1="10" y1="8" x2="62" y2="76" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D7BE78" />
        <stop offset="1" stopColor="#A87727" />
      </linearGradient>
      <linearGradient id="lana-mark-green" x1="22" y1="10" x2="52" y2="74" gradientUnits="userSpaceOnUse">
        <stop stopColor="#66875B" />
        <stop offset="1" stopColor="#123E32" />
      </linearGradient>
    </defs>
    <path d="M36 4C18 9 7 25 8 43c1 18 12 31 28 37M36 4c18 5 29 21 28 39-1 18-12 31-28 37" fill="none" stroke="#9CAE78" strokeWidth="1.6" />
    <path d="M29 10c-8 7-12 16-12 27M43 10c8 7 12 16 12 27M18 52c4 12 10 19 18 24M54 52c-4 12-10 19-18 24" fill="none" stroke="#C5B477" strokeWidth="1.1" opacity=".9" />
    <path d="M37 14c-9 5-13 12-13 19 0 9 7 13 13 18 6 5 11 9 11 17 0 7-5 12-12 12-8 0-13-6-13-13 0-6 4-12 12-18l5-4c7-6 10-11 10-17 0-8-5-14-13-14Z" fill="none" stroke="url(#lana-mark-green)" strokeWidth="3" strokeLinecap="round" />
    <path d="M29 28c4-4 8-6 13-7M28 61c4 4 9 6 15 6" fill="none" stroke="url(#lana-mark-gold)" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 57c-4 1-7 4-8 8 4 1 8 0 11-4M55 57c4 1 7 4 8 8-4 1-8 0-11-4" fill="#7C9765" />
    <path d="M35 4c-1-3 1-4 3-4 1 2 0 4-3 4Z" fill="#B69142" />
  </svg>
);

export const BrandLockup = ({ compact = false }: { compact?: boolean }) => (
  <div className="l8w-brand l8w-brand--mark-only" aria-label="Lana8Wonder">
    <LanaMark className={compact ? "l8w-brand__mark l8w-brand__mark--compact" : "l8w-brand__mark"} />
  </div>
);

export const NatureFlowIllustration = ({ compact = false }: { compact?: boolean }) => (
  <div className={compact ? "l8w-flow-visual l8w-flow-visual--compact" : "l8w-flow-visual"} aria-hidden="true">
    <svg viewBox="0 0 720 550" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="flow-water" x1="82" y1="355" x2="650" y2="476" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D7E5E0" />
          <stop offset=".5" stopColor="#79AAB2" />
          <stop offset="1" stopColor="#315F67" />
        </linearGradient>
        <linearGradient id="flow-gold" x1="298" y1="140" x2="415" y2="404" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E6D394" />
          <stop offset="1" stopColor="#A9782D" />
        </linearGradient>
        <radialGradient id="flow-glow" cx="0" cy="0" r="1" gradientTransform="translate(369 293) rotate(90) scale(202)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFDF5" />
          <stop offset=".55" stopColor="#FAF4E5" stopOpacity=".75" />
          <stop offset="1" stopColor="#F8F0DD" stopOpacity="0" />
        </radialGradient>
        <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#244C3D" floodOpacity=".14" />
        </filter>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#B78A36" />
        </marker>
      </defs>

      <circle cx="370" cy="268" r="222" fill="url(#flow-glow)" />
      <circle cx="370" cy="268" r="205" fill="none" stroke="#DCCB9B" strokeWidth="1" strokeDasharray="2 8" />
      <circle cx="370" cy="268" r="160" fill="none" stroke="#E7DDC3" strokeWidth="1" />
      <path d="M129 371C234 322 301 354 375 386c75 32 160 35 258-15v116H91Z" fill="url(#flow-water)" opacity=".68" />
      <path d="M77 412c101-65 194-58 290-12 92 44 179 37 286-28" fill="none" stroke="#F8F4E8" strokeWidth="15" opacity=".86" />
      <path d="M69 428c113-52 202-44 299-2 94 41 188 30 300-36" fill="none" stroke="#D8BD77" strokeWidth="2" opacity=".9" />
      <path d="M76 448c110-45 204-37 300 4 94 40 190 24 296-42" fill="none" stroke="#F5E8BE" strokeWidth="1.5" opacity=".85" />

      <path d="M163 267C199 182 275 124 351 112" fill="none" stroke="#B78A36" strokeWidth="2" markerEnd="url(#flow-arrow)" />
      <path d="M407 114C497 134 552 195 571 261" fill="none" stroke="#B78A36" strokeWidth="2" markerEnd="url(#flow-arrow)" />
      <path d="M563 311C528 361 474 389 430 397" fill="none" stroke="#547B68" strokeWidth="2" markerEnd="url(#flow-arrow)" />

      <g filter="url(#soft-shadow)">
        <circle cx="145" cy="292" r="47" fill="#FFFDF8" stroke="#D9C791" strokeWidth="2" />
        <ellipse cx="145" cy="298" rx="12" ry="17" fill="#7794A0" />
        <ellipse cx="141" cy="294" rx="4" ry="7" fill="#E8F3F1" opacity=".8" />
      </g>
      <g filter="url(#soft-shadow)">
        <circle cx="358" cy="99" r="58" fill="#FFFDF8" stroke="#D9C791" strokeWidth="2" />
        <path d="M359 127V84" stroke="#3F654D" strokeWidth="4" strokeLinecap="round" />
        <path d="M358 103c-19-1-27-11-28-26 16-1 28 8 28 26ZM361 91c2-17 12-26 27-27 1 15-8 26-27 27Z" fill="#74915E" />
        <path d="M359 116c-12 0-20-6-23-16 12-2 20 4 23 16Z" fill="#A4B986" />
      </g>
      <g filter="url(#soft-shadow)">
        <circle cx="586" cy="286" r="72" fill="#FFFDF8" stroke="#D9C791" strokeWidth="2" />
        <path d="M584 332V275" stroke="#725333" strokeWidth="8" strokeLinecap="round" />
        <path d="M584 294c-36 1-51-18-50-40 18-30 42-37 53-12 12-27 39-20 51 9 2 25-17 44-54 43Z" fill="#466C48" />
        <path d="M541 335c25-12 62-11 88 0" fill="none" stroke="#A8B483" strokeWidth="5" strokeLinecap="round" />
      </g>

      <g transform="translate(304 190)" filter="url(#soft-shadow)">
        <path d="M67 0c37 0 67 27 67 61 0 27-16 44-41 64 28 19 46 39 46 72 0 39-32 70-72 70S0 237 0 200c0-31 17-53 46-75C20 105 4 87 4 61 4 27 31 0 67 0Z" fill="#194E3C" stroke="url(#flow-gold)" strokeWidth="5" />
        <path d="M67 20c22 0 42 16 42 39 0 20-13 34-42 55-28-21-40-35-40-55 0-23 18-39 40-39Zm0 221c-25 0-44-18-44-42 0-23 14-39 44-61 31 22 48 38 48 61 0 24-21 42-48 42Z" fill="#F6EDCE" stroke="#C69B43" strokeWidth="2" />
        <path d="M67 213v-42M67 190c-14 0-24-8-26-22 14-1 24 7 26 22ZM69 179c2-13 10-21 23-22 1 13-7 21-23 22Z" fill="none" stroke="#456F4F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="67" cy="61" r="19" fill="none" stroke="#B88B36" strokeWidth="3" />
        <path d="M57 60h20M62 51l-5 9 5 9M72 51l5 9-5 9" fill="none" stroke="#B88B36" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g opacity=".85">
        <path d="M98 160c-22 16-38 40-43 69 21-6 39-20 50-40M642 137c19 16 31 38 36 64-20-5-36-18-47-36" fill="none" stroke="#A5B98E" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="78" cy="185" rx="10" ry="23" transform="rotate(-42 78 185)" fill="#B8C6A4" />
        <ellipse cx="665" cy="167" rx="10" ry="23" transform="rotate(43 665 167)" fill="#B8C6A4" />
      </g>
    </svg>
  </div>
);

export const BalanceSignals = ({
  labels = {
    people: "People Connected",
    value: "Value in Motion",
    balance: "Balance Sustained",
  },
}: {
  labels?: { people: string; value: string; balance: string };
}) => (
  <div className="l8w-signals" aria-label={`${labels.people}; ${labels.value}; ${labels.balance}`}>
    <div className="l8w-signal">
      <span><Users /></span>
      <p>{labels.people}</p>
    </div>
    <div className="l8w-signal">
      <span><RefreshCw /></span>
      <p>{labels.value}</p>
    </div>
    <div className="l8w-signal">
      <span><ShieldCheck /></span>
      <p>{labels.balance}</p>
    </div>
    <Leaf className="l8w-signals__leaf" aria-hidden="true" />
  </div>
);
