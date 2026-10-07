// Shared sky colour. The dome and the lake both call evaluateSky() so a
// reflection is the same function as the sky, on the reflected direction.
// No second scene render.
//
// Noise is sampled from the 3D view direction. An atan2 azimuth has a branch
// cut (a hard vertical seam). A direction on the sphere does not.

export const SKY_EVALUATE_GLSL = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float hash3(vec3 p) {
    p = fract(p * vec3(123.34, 456.21, 789.16));
    p += dot(p, p.yzx + 45.32);
    return fract(p.x * p.y * p.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Value noise on a 3D point. Continuous across the whole sphere.
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i);
    float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }

  const float pi = 3.141592653589793238462643383279502884197169;
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
  const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
  const float ONE_OVER_FOURPI = 0.07957747154594767;

  float rayleighPhase(float cosTheta) {
    return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
  }

  float hgPhase(float cosTheta, float g) {
    float g2 = pow(g, 2.0);
    float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
    return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
  }

  // Preetham sky plus night lift, sparse cloud streaks, moon and stars.
  // direction is a unit view direction. y = 1 is straight up.
  vec3 evaluateSky(vec3 direction) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    float zenithAngle = acos(max(0.0, dot(up, direction)));
    float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;

    vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

    float cosTheta = dot(direction, vSunDirection);
    float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
    vec3 betaRTheta = vBetaR * rPhase;
    float mPhase = hgPhase(cosTheta, uMieDirectionalG);
    vec3 betaMTheta = vBetaM * mPhase;

    vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
    Lin *= mix(
      vec3(1.0),
      pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)),
      clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0)
    );

    vec3 L0 = vec3(0.1) * Fex;
    float sundisc = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
    L0 += (vSunE * 19000.0 * Fex) * sundisc * uShowSunDisc;

    vec3 skyColor = (Lin + L0) * uSkyGain + vec3(0.0, 0.0003, 0.00075);
    float skyLuma = max(dot(skyColor, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
    skyColor *= (skyLuma / (1.0 + skyLuma * uHighlightCompress)) / skyLuma;
    float gradedLuma = dot(skyColor, vec3(0.2126, 0.7152, 0.0722));
    skyColor = max(mix(vec3(gradedLuma), skyColor, uSaturation), vec3(0.0));

    float sunDown = smoothstep(0.12, -0.15, vSunDirection.y);
    float liftHeight = clamp(direction.y * 0.85 + 0.05, 0.0, 1.0);
    vec3 airglow = mix(uHorizonColor, uZenithColor, liftHeight);
    skyColor += airglow * uNightLift * sunDown;

    // Thin streaks, not a glowing band. Stretched in elevation so each
    // wisp is a filament. The threshold is high on purpose: empty sky
    // is better than a smear. 3D noise, so there is no azimuth seam.
    vec3 cloudP = direction * vec3(1.7, 7.5, 1.7);
    cloudP += vec3(uTime * uCloudSpeed, 0.0, uTime * uCloudSpeed * 0.41);
    float warp = noise3(cloudP * 1.3);
    vec3 streakP = cloudP * vec3(1.1, 5.5, 1.1) + vec3(warp * 0.35, 0.2, 0.0);
    float filament = noise3(streakP);
    float grain = noise3(streakP * 2.7 + 4.0);
    float streak = smoothstep(0.74, 0.9, filament) * smoothstep(0.42, 0.78, grain);
    streak *= smoothstep(0.02, 0.16, direction.y);
    streak *= 1.0 - smoothstep(0.38, 0.7, direction.y);

    vec3 sunDir = normalize(vSunDirection);
    vec3 moonDir = normalize(uMoonDirection);
    // Afterglow lights the underside of a streak that faces the sunset.
    float sunsetSide = smoothstep(-0.02, 0.55, dot(direction, sunDir));
    float underside = 1.0 - smoothstep(0.04, 0.32, direction.y);
    float moonSide = clamp(dot(direction, moonDir), 0.0, 1.0);
    vec3 warm = vec3(0.55, 0.22, 0.12) * sunsetSide * underside;
    vec3 cool = vec3(0.32, 0.38, 0.52) * (0.2 + 0.8 * moonSide) * (1.0 - sunsetSide * 0.85);
    skyColor += (warm + cool) * streak * uCloudAmount;

    float moonFacing = dot(direction, moonDir);
    // Disc is about 1.5° across. The halo is a thin ring just outside it.
    // The disc used to be written at 5× linear, which bloom turned into a
    // blob. It now sits just above the bloom threshold, so the disc stays
    // white and only a small halo blooms.
    float moonDisc = smoothstep(0.9998, 0.99992, moonFacing);
    float moonHalo = smoothstep(0.99955, 0.9998, moonFacing) * (1.0 - moonDisc);
    skyColor += vec3(0.96, 0.97, 1.0) * (moonDisc * 1.28 + moonHalo * 0.2) * uMoonStrength;

    // Stars on a 3D grid of the view direction. The old atan2 cell
    // wrapped at one meridian and drew a vertical line of mismatched stars.
    vec3 starP = direction * 24.0;
    vec3 starCell = floor(starP);
    vec3 starLocal = fract(starP) - 0.5;
    float starHash = hash3(starCell);
    float present = step(1.0 - uStarDensity, starHash);
    vec3 jitter = (vec3(
      hash3(starCell + 1.7),
      hash3(starCell + 8.3),
      hash3(starCell + 2.2)
    ) - 0.5) * 0.55;
    float dist = length(starLocal - jitter);
    float px = clamp(length(vec2(fwidth(starP.x), fwidth(starP.y))), 0.002, 0.14);
    float star = smoothstep(px * 1.25, px * 0.18, dist) * present;
    float phase = hash3(starCell + 4.2) * 6.28318;
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.7 + phase);
    float brightness = 0.45 + 0.55 * hash3(starCell + 3.1);
    float luma = dot(skyColor, vec3(0.2126, 0.7152, 0.0722));
    float inDarkSky = 1.0 - smoothstep(0.06, 0.32, luma);
    float aboveHorizon = smoothstep(0.04, 0.18, direction.y);
    skyColor += vec3(star * twinkle * brightness * inDarkSky * aboveHorizon * uStarBrightness);

    float gradeHeight = smoothstep(-0.2, 0.85, direction.y);
    vec3 gradeColor = mix(uHorizonColor, uZenithColor, gradeHeight);
    skyColor = mix(skyColor, gradeColor, clamp(uGrade, 0.0, 1.0));
    return skyColor;
  }
`
