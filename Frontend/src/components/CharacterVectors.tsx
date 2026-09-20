import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

interface CharacterSvgProps {
  width?: number;
  height?: number;
}

export function MafiaVector({ width = 160, height = 150 }: CharacterSvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 150" fill="none">
      <Defs>
        <LinearGradient id="mafiaBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#2a0812" />
          <Stop offset="50%" stopColor="#170810" />
          <Stop offset="100%" stopColor="#0a0509" />
        </LinearGradient>
        <LinearGradient id="mafiaGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#e11d48" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1e2029" />
          <Stop offset="100%" stopColor="#0f1117" />
        </LinearGradient>
        <LinearGradient id="tieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#f43f5e" />
          <Stop offset="100%" stopColor="#9f1239" />
        </LinearGradient>
      </Defs>

      {/* Background card ambiance */}
      <Rect width="160" height="150" rx="12" fill="url(#mafiaBg)" />
      <Circle cx="80" cy="55" r="46" fill="url(#mafiaGlow)" />

      {/* Streetlamp backdrop shadow bars */}
      <Path d="M20 20 L24 130" stroke="#4c0519" strokeWidth="1.5" strokeOpacity="0.3" />
      <Path d="M140 20 L136 130" stroke="#4c0519" strokeWidth="1.5" strokeOpacity="0.3" />

      {/* Trench coat / Shoulders */}
      <Path
        d="M26 150 C30 110 50 100 80 100 C110 100 130 110 134 150 Z"
        fill="url(#suitGrad)"
      />
      {/* Coat Lapels */}
      <Path d="M54 102 L72 135 L62 150 L38 150 Z" fill="#131620" />
      <Path d="M106 102 L88 135 L98 150 L122 150 Z" fill="#131620" />

      {/* White Shirt Collar */}
      <Path d="M68 96 L80 112 L92 96 Z" fill="#e2e8f0" />

      {/* Crimson Tie */}
      <Path d="M77 106 L83 106 L86 138 L80 148 L74 138 Z" fill="url(#tieGrad)" />
      <Path d="M76 104 L84 104 L82 110 L78 110 Z" fill="#fb7185" />

      {/* Red Lapel Carnation Flower */}
      <Circle cx="58" cy="116" r="4.5" fill="#f43f5e" />
      <Circle cx="58" cy="116" r="2.5" fill="#ffe4e6" />

      {/* Head / Jaw (Shadowed Noir) */}
      <Path
        d="M62 66 C62 55 69 48 80 48 C91 48 98 55 98 66 C98 78 91 88 80 88 C69 88 62 78 62 66 Z"
        fill="#292025"
      />
      {/* Subtle jaw highlight */}
      <Path d="M72 82 Q80 88 88 82" stroke="#9f1239" strokeWidth="1.5" fill="none" />

      {/* Menacing eyes in shadow */}
      <Path d="M68 64 L75 66" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M92 64 L85 66" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />

      {/* Fedora Hat */}
      <G>
        {/* Brim */}
        <Path
          d="M42 56 Q80 44 118 56 Q80 50 42 56 Z"
          fill="#0c0d12"
          stroke="#475569"
          strokeWidth="0.8"
        />
        {/* Crown */}
        <Path
          d="M55 52 C53 36 60 26 73 25 C78 27 82 27 87 25 C100 26 107 36 105 52 Z"
          fill="#131620"
        />
        {/* Crown crease indent */}
        <Path d="M73 25 C78 30 82 30 87 25" stroke="#090a0f" strokeWidth="2.5" />
        {/* Fedora Crimson Ribbon */}
        <Path
          d="M54 48 C66 46 94 46 106 48 L105 52 C94 50 66 50 55 52 Z"
          fill="#be123c"
        />
      </G>

      {/* Cigarette & Glowing Smoke */}
      <Path d="M83 78 L95 82" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="96" cy="82.5" r="1.5" fill="#f97316" />
      <Path
        d="M97 81 C101 75 97 70 102 64 C106 59 104 53 108 48"
        stroke="#94a3b8"
        strokeWidth="1.2"
        strokeOpacity="0.5"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function DetectiveVector({ width = 160, height = 150 }: CharacterSvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 150" fill="none">
      <Defs>
        <LinearGradient id="detBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#082032" />
          <Stop offset="50%" stopColor="#0a1928" />
          <Stop offset="100%" stopColor="#050d17" />
        </LinearGradient>
        <LinearGradient id="detGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="trenchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#473e34" />
          <Stop offset="100%" stopColor="#25211b" />
        </LinearGradient>
        <LinearGradient id="glassLens" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#bae6fd" stopOpacity="0.7" />
          <Stop offset="50%" stopColor="#38bdf8" stopOpacity="0.3" />
          <Stop offset="100%" stopColor="#0369a1" stopOpacity="0.5" />
        </LinearGradient>
      </Defs>

      {/* Background card ambiance */}
      <Rect width="160" height="150" rx="12" fill="url(#detBg)" />
      <Circle cx="80" cy="55" r="46" fill="url(#detGlow)" />

      {/* Rain / street lines */}
      <Path d="M30 10 L25 140" stroke="#0284c7" strokeWidth="1" strokeOpacity="0.2" />
      <Path d="M135 15 L130 145" stroke="#0284c7" strokeWidth="1" strokeOpacity="0.2" />

      {/* Trench Coat Shoulders */}
      <Path
        d="M26 150 C30 112 50 102 78 102 C106 102 126 112 134 150 Z"
        fill="url(#trenchGrad)"
      />
      {/* Turned up Trench Collar */}
      <Path d="M48 94 L68 126 L52 145 Z" fill="#3a322a" />
      <Path d="M112 94 L92 126 L108 145 Z" fill="#3a322a" />

      {/* Inner shirt & gold badge */}
      <Path d="M68 114 L78 128 L88 114 Z" fill="#0f172a" />
      <Path d="M78 122 L83 130 L78 138 L73 130 Z" fill="#eab308" />

      {/* Head / Face in shadow */}
      <Path
        d="M62 66 C62 55 69 48 80 48 C91 48 98 55 98 66 C98 78 91 88 80 88 C69 88 62 78 62 66 Z"
        fill="#242220"
      />

      {/* Keen Eyes peering out */}
      <Circle cx="72" cy="65" r="2" fill="#38bdf8" />
      <Circle cx="88" cy="65" r="2" fill="#38bdf8" />

      {/* Sleuth Fedora Hat */}
      <G>
        <Path
          d="M40 56 Q80 46 120 56 Q80 51 40 56 Z"
          fill="#1c1815"
          stroke="#524538"
          strokeWidth="0.8"
        />
        <Path
          d="M54 52 C52 35 60 25 73 24 C78 26 82 26 87 24 C100 25 108 35 106 52 Z"
          fill="#312a23"
        />
        <Path d="M73 24 C78 29 82 29 87 24" stroke="#1c1815" strokeWidth="2.5" />
        {/* Hat band */}
        <Path
          d="M53 48 C66 46 94 46 107 48 L106 52 C94 50 66 50 54 52 Z"
          fill="#0284c7"
        />
      </G>

      {/* Magnifying Glass In Hand */}
      <G transform="translate(10, -5)">
        {/* Handle */}
        <Path d="M106 118 L122 138" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
        <Path d="M107 119 L112 125" stroke="#f59e0b" strokeWidth="5.5" strokeLinecap="round" />
        {/* Lens Rim */}
        <Circle
          cx="96"
          cy="106"
          r="19"
          stroke="#f59e0b"
          strokeWidth="3.5"
          fill="url(#glassLens)"
        />
        {/* Lens Glare */}
        <Path
          d="M87 96 A 14 14 0 0 1 106 94"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Finger gripping */}
        <Path d="M112 122 C115 125 117 127 114 130" stroke="#a16207" strokeWidth="3" />
      </G>
    </Svg>
  );
}

export function DoctorVector({ width = 160, height = 150 }: CharacterSvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 150" fill="none">
      <Defs>
        <LinearGradient id="docBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#052e25" />
          <Stop offset="50%" stopColor="#07201c" />
          <Stop offset="100%" stopColor="#041210" />
        </LinearGradient>
        <LinearGradient id="docGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
          <Stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="labCoat" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#f1f5f9" />
          <Stop offset="100%" stopColor="#94a3b8" />
        </LinearGradient>
      </Defs>

      {/* Background card ambiance */}
      <Rect width="160" height="150" rx="12" fill="url(#docBg)" />
      <Circle cx="80" cy="55" r="46" fill="url(#docGlow)" />

      {/* EKG / Heartbeat line faint backdrop */}
      <Path
        d="M10 75 L40 75 L46 62 L52 88 L58 72 L64 78 L70 75 L150 75"
        stroke="#10b981"
        strokeWidth="1.2"
        strokeOpacity="0.25"
        fill="none"
      />

      {/* Lab Coat / Shoulders */}
      <Path
        d="M26 150 C30 112 50 102 80 102 C110 102 130 112 134 150 Z"
        fill="url(#labCoat)"
      />
      {/* Inner dark scrub shirt */}
      <Path d="M66 102 L80 128 L94 102 Z" fill="#064e3b" />

      {/* Emergency First-Aid Cross on Lab Coat Pocket */}
      <Rect x="44" y="125" width="16" height="16" rx="3" fill="#047857" />
      <Rect x="50.5" y="128" width="3" height="10" rx="1" fill="#ffffff" />
      <Rect x="47" y="131.5" width="10" height="3" rx="1" fill="#ffffff" />

      {/* Stethoscope */}
      <Path
        d="M68 104 C64 120 70 140 82 140 C94 140 98 120 92 104"
        stroke="#334155"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="82" cy="141" r="5" fill="#64748b" stroke="#e2e8f0" strokeWidth="1.2" />

      {/* Head / Face */}
      <Path
        d="M63 64 C63 52 70 45 80 45 C90 45 97 52 97 64 C97 76 90 85 80 85 C70 85 63 76 63 64 Z"
        fill="#263430"
      />

      {/* Hair (Neat Surgeon Style) */}
      <Path
        d="M62 58 C62 42 70 34 80 34 C90 34 98 42 98 56 C94 50 88 47 80 47 C72 47 66 52 62 58 Z"
        fill="#1e293b"
      />

      {/* Surgical Mask */}
      <Path
        d="M65 67 C65 67 73 66 80 66 C87 66 95 67 95 67 C95 78 88 84 80 84 C72 84 65 78 65 67 Z"
        fill="#059669"
        stroke="#34d399"
        strokeWidth="0.8"
      />
      <Path d="M65 68 L60 64" stroke="#6ee7b7" strokeWidth="1" />
      <Path d="M95 68 L100 64" stroke="#6ee7b7" strokeWidth="1" />

      {/* Calming, focused eyes */}
      <Circle cx="72" cy="60" r="2" fill="#a7f3d0" />
      <Circle cx="88" cy="60" r="2" fill="#a7f3d0" />

      {/* Syringe / Healing vial glow at bottom right */}
      <G transform="translate(106, 102)">
        <Rect x="4" y="8" width="6" height="18" rx="2" fill="#047857" stroke="#10b981" strokeWidth="1" />
        <Rect x="5" y="13" width="4" height="11" fill="#34d399" />
        <Path d="M7 26 L7 32" stroke="#e2e8f0" strokeWidth="1.2" />
        <Path d="M3 8 L11 8" stroke="#94a3b8" strokeWidth="1.5" />
      </G>
    </Svg>
  );
}

export function CivilianVector({ width = 160, height = 150 }: CharacterSvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 150" fill="none">
      <Defs>
        <LinearGradient id="civBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#221435" />
          <Stop offset="50%" stopColor="#170c24" />
          <Stop offset="100%" stopColor="#0b0612" />
        </LinearGradient>
        <LinearGradient id="civGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#c084fc" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="coatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#2e263d" />
          <Stop offset="100%" stopColor="#181322" />
        </LinearGradient>
      </Defs>

      {/* Background card ambiance */}
      <Rect width="160" height="150" rx="12" fill="url(#civBg)" />
      <Circle cx="80" cy="55" r="46" fill="url(#civGlow)" />

      {/* Noir Streetlamp cone in background */}
      <Path
        d="M80 10 L135 150 L25 150 Z"
        fill="#e9d5ff"
        fillOpacity="0.04"
      />
      {/* Streetlamp Pole */}
      <Path d="M128 25 L128 145" stroke="#475569" strokeWidth="2" strokeOpacity="0.35" />
      <Circle cx="128" cy="25" r="5" fill="#fef08a" fillOpacity="0.7" />

      {/* Civilian Coat & Scarf */}
      <Path
        d="M28 150 C32 114 52 104 80 104 C108 104 128 114 132 150 Z"
        fill="url(#coatGrad)"
      />

      {/* Scarf wrapped around neck */}
      <Path
        d="M60 96 C68 93 92 93 100 96 C104 104 96 114 80 114 C64 114 56 104 60 96 Z"
        fill="#7e22ce"
      />
      <Path d="M74 110 L70 138 L84 138 L82 110 Z" fill="#9333ea" />

      {/* Head / Hair / Beret or Hood */}
      <Path
        d="M63 66 C63 54 70 47 80 47 C90 47 97 54 97 66 C97 78 90 87 80 87 C70 87 63 78 63 66 Z"
        fill="#2a2233"
      />

      {/* Stylish Noir Cap / Hair */}
      <Path
        d="M58 54 C58 38 68 30 80 30 C94 30 102 38 104 50 C94 48 68 48 58 54 Z"
        fill="#3b2b4d"
      />
      {/* Cap peak */}
      <Path d="M60 49 Q78 44 98 49 Q78 47 60 49 Z" fill="#1c1426" />

      {/* Vigilant, determined eyes */}
      <Circle cx="73" cy="64" r="2.2" fill="#e9d5ff" />
      <Circle cx="87" cy="64" r="2.2" fill="#e9d5ff" />

      {/* Daily Gazette Newspaper under arm */}
      <G transform="translate(34, 114) rotate(-15)">
        <Rect x="0" y="0" width="22" height="28" rx="2" fill="#e2e8f0" />
        <Rect x="2" y="2" width="18" height="4" fill="#0f172a" />
        <Path d="M3 9 L19 9" stroke="#64748b" strokeWidth="1" />
        <Path d="M3 13 L19 13" stroke="#64748b" strokeWidth="1" />
        <Path d="M3 17 L14 17" stroke="#64748b" strokeWidth="1" />
        <Path d="M3 21 L17 21" stroke="#94a3b8" strokeWidth="1" />
      </G>

      {/* Megaphone / Ballot icon glow badge */}
      <Circle cx="122" cy="120" r="9" fill="#a855f7" fillOpacity="0.25" />
      <Path
        d="M117 122 L121 117 L124 117 L127 114 L127 126 L124 123 L121 123 Z"
        fill="#c084fc"
      />
    </Svg>
  );
}
