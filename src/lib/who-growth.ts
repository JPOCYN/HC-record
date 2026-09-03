export type WhoGrowthMetric = "weight" | "height" | "head";

type LmsRow = readonly [month: number, l: number, m: number, s: number];

// WHO Child Growth Standards, girls, birth to 5 years.
// Sources: WHO weight-for-age and length/height-for-age percentile tables.
const WEIGHT_GIRLS: readonly LmsRow[] = [
  [0,.3809,3.2322,.14171],[1,.1714,4.1873,.13724],[2,.0962,5.1282,.13],[3,.0402,5.8458,.12619],[4,-.005,6.4237,.12402],[5,-.043,6.8985,.12274],[6,-.0756,7.297,.12204],[7,-.1039,7.6422,.12178],[8,-.1288,7.9487,.12181],[9,-.1507,8.2254,.12199],
  [10,-.17,8.48,.12223],[11,-.1872,8.7192,.12247],[12,-.2024,8.9481,.12268],[13,-.2158,9.1699,.12283],[14,-.2278,9.387,.12294],[15,-.2384,9.6008,.12299],[16,-.2478,9.8124,.12303],[17,-.2562,10.0226,.12306],[18,-.2637,10.2315,.12309],[19,-.2703,10.4393,.12315],
  [20,-.2762,10.6464,.12323],[21,-.2815,10.8534,.12335],[22,-.2862,11.0608,.1235],[23,-.2903,11.2688,.12369],[24,-.2941,11.4775,.1239],[25,-.2975,11.6864,.12414],[26,-.3005,11.8947,.12441],[27,-.3032,12.1015,.12472],[28,-.3057,12.3059,.12506],[29,-.308,12.5073,.12545],
  [30,-.3101,12.7055,.12587],[31,-.312,12.9006,.12633],[32,-.3138,13.093,.12683],[33,-.3155,13.2837,.12737],[34,-.3171,13.4731,.12794],[35,-.3186,13.6618,.12855],[36,-.3201,13.8503,.12919],[37,-.3216,14.0385,.12988],[38,-.323,14.2265,.13059],[39,-.3243,14.414,.13135],
  [40,-.3257,14.601,.13213],[41,-.327,14.7873,.13293],[42,-.3283,14.9727,.13376],[43,-.3296,15.1573,.1346],[44,-.3309,15.341,.13545],[45,-.3322,15.524,.1363],[46,-.3335,15.7064,.13716],[47,-.3348,15.8882,.138],[48,-.3361,16.0697,.13884],[49,-.3374,16.2511,.13968],
  [50,-.3387,16.4322,.14051],[51,-.34,16.6133,.14132],[52,-.3414,16.7942,.14213],[53,-.3427,16.9748,.14293],[54,-.344,17.1551,.14371],[55,-.3453,17.3347,.14448],[56,-.3466,17.5136,.14525],[57,-.3479,17.6916,.146],[58,-.3492,17.8686,.14675],[59,-.3505,18.0445,.14748],[60,-.3518,18.2193,.14821],
];

const LENGTH_GIRLS: readonly LmsRow[] = [
  [0,1,49.1477,.0379],[1,1,53.6872,.0364],[2,1,57.0673,.03568],[3,1,59.8029,.0352],[4,1,62.0899,.03486],[5,1,64.0301,.03463],[6,1,65.7311,.03448],[7,1,67.2873,.03441],[8,1,68.7498,.0344],[9,1,70.1435,.03444],[10,1,71.4818,.03452],[11,1,72.771,.03464],[12,1,74.015,.03479],
  [13,1,75.2176,.03496],[14,1,76.3817,.03514],[15,1,77.5099,.03534],[16,1,78.6055,.03555],[17,1,79.671,.03576],[18,1,80.7079,.03598],[19,1,81.7182,.0362],[20,1,82.7036,.03643],[21,1,83.6654,.03666],[22,1,84.604,.03688],[23,1,85.5202,.03711],[24,1,86.4153,.03734],
];

const HEIGHT_GIRLS: readonly LmsRow[] = [
  [24,1,85.7153,.03764],[25,1,86.5904,.03786],[26,1,87.4462,.03808],[27,1,88.283,.0383],[28,1,89.1004,.03851],[29,1,89.8991,.03872],[30,1,90.6797,.03893],[31,1,91.443,.03913],[32,1,92.1906,.03933],[33,1,92.9239,.03952],[34,1,93.6444,.03971],[35,1,94.3533,.03989],
  [36,1,95.0515,.04006],[37,1,95.7399,.04024],[38,1,96.4187,.04041],[39,1,97.0885,.04057],[40,1,97.7493,.04073],[41,1,98.4015,.04089],[42,1,99.0448,.04105],[43,1,99.6795,.0412],[44,1,100.3058,.04135],[45,1,100.9238,.0415],[46,1,101.5337,.04164],[47,1,102.136,.04179],
  [48,1,102.7312,.04193],[49,1,103.3197,.04206],[50,1,103.9021,.0422],[51,1,104.4786,.04233],[52,1,105.0494,.04246],[53,1,105.6148,.04259],[54,1,106.1748,.04272],[55,1,106.7295,.04285],[56,1,107.2788,.04298],[57,1,107.8227,.0431],[58,1,108.3613,.04322],[59,1,108.8948,.04334],[60,1,109.4233,.04347],
];

const HEAD_CIRCUMFERENCE_GIRLS: readonly LmsRow[] = [
  [0,1,33.8787,.03496],[1,1,36.5463,.0321],[2,1,38.2521,.03168],[3,1,39.5328,.0314],[4,1,40.5817,.03119],[5,1,41.459,.03102],[6,1,42.1995,.03087],[7,1,42.829,.03075],[8,1,43.3671,.03063],[9,1,43.83,.03053],
  [10,1,44.2319,.03044],[11,1,44.5844,.03035],[12,1,44.8965,.03027],[13,1,45.1752,.03019],[14,1,45.4265,.03012],[15,1,45.6551,.03006],[16,1,45.865,.02999],[17,1,46.0598,.02993],[18,1,46.2424,.02987],[19,1,46.4152,.02982],
  [20,1,46.5801,.02977],[21,1,46.7384,.02972],[22,1,46.8913,.02967],[23,1,47.0391,.02962],[24,1,47.1822,.02957],[25,1,47.3204,.02953],[26,1,47.4536,.02949],[27,1,47.5817,.02945],[28,1,47.7045,.02941],[29,1,47.8219,.02937],
  [30,1,47.934,.02933],[31,1,48.041,.02929],[32,1,48.1432,.02926],[33,1,48.2408,.02922],[34,1,48.3343,.02919],[35,1,48.4239,.02915],[36,1,48.5099,.02912],[37,1,48.5926,.02909],[38,1,48.6722,.02906],[39,1,48.7489,.02903],
  [40,1,48.8228,.029],[41,1,48.8941,.02897],[42,1,48.9629,.02894],[43,1,49.0294,.02891],[44,1,49.0937,.02888],[45,1,49.156,.02886],[46,1,49.2164,.02883],[47,1,49.2751,.0288],[48,1,49.3321,.02878],[49,1,49.3877,.02875],
  [50,1,49.4419,.02873],[51,1,49.4947,.0287],[52,1,49.5464,.02868],[53,1,49.5969,.02865],[54,1,49.6464,.02863],[55,1,49.6947,.02861],[56,1,49.7421,.02859],[57,1,49.7885,.02856],[58,1,49.8341,.02854],[59,1,49.8789,.02852],[60,1,49.9229,.0285],
];

export const WHO_PERCENTILE_CURVES = [
  { percentile: 3, z: -1.880793608 },
  { percentile: 15, z: -1.036433389 },
  { percentile: 50, z: 0 },
  { percentile: 85, z: 1.036433389 },
  { percentile: 97, z: 1.880793608 },
] as const;

export function ageInMonths(dateOfBirth: string, measuredAt: string | Date): number {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const measured = typeof measuredAt === "string" ? new Date(measuredAt) : measuredAt;
  if (Number.isNaN(birth.getTime()) || Number.isNaN(measured.getTime())) return Number.NaN;
  let months = (measured.getUTCFullYear() - birth.getUTCFullYear()) * 12 + measured.getUTCMonth() - birth.getUTCMonth();
  let anchor = monthAnchor(birth, months);
  if (anchor > measured) {
    months -= 1;
    anchor = monthAnchor(birth, months);
  }
  const next = monthAnchor(birth, months + 1);
  return months + (measured.getTime() - anchor.getTime()) / (next.getTime() - anchor.getTime());
}

export function whoReferenceValue(metric: WhoGrowthMetric, ageMonths: number, z: number): number | null {
  const lms = lmsAtAge(metric, ageMonths);
  if (!lms) return null;
  const [, l, m, s] = lms;
  if (Math.abs(l) < 0.000001) return m * Math.exp(s * z);
  const base = 1 + l * s * z;
  return base > 0 ? m * Math.pow(base, 1 / l) : null;
}

export function whoPercentile(metric: WhoGrowthMetric, dateOfBirth: string, measuredAt: string, value: number): number | null {
  const ageMonths = ageInMonths(dateOfBirth, measuredAt);
  const lms = lmsAtAge(metric, ageMonths);
  if (!lms || value <= 0) return null;
  const [, l, m, s] = lms;
  const z = Math.abs(l) < 0.000001 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
  return normalCdf(z) * 100;
}

export function formatWhoPercentile(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 1) return "<1%";
  if (value > 99) return ">99%";
  return `${Math.round(value)}%`;
}

function lmsAtAge(metric: WhoGrowthMetric, ageMonths: number): LmsRow | null {
  if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 60) return null;
  const rows = metric === "weight"
    ? WEIGHT_GIRLS
    : metric === "head"
      ? HEAD_CIRCUMFERENCE_GIRLS
      : ageMonths < 24 ? LENGTH_GIRLS : HEIGHT_GIRLS;
  const lowerMonth = Math.floor(ageMonths);
  const upperMonth = Math.ceil(ageMonths);
  const lower = rows.find((row) => row[0] === lowerMonth) ?? rows[0];
  const upper = rows.find((row) => row[0] === upperMonth) ?? lower;
  if (lowerMonth === upperMonth) return lower;
  const ratio = ageMonths - lowerMonth;
  return [ageMonths, interpolate(lower[1], upper[1], ratio), interpolate(lower[2], upper[2], ratio), interpolate(lower[3], upper[3], ratio)];
}

function monthAnchor(birth: Date, months: number): Date {
  return new Date(Date.UTC(birth.getUTCFullYear(), birth.getUTCMonth() + months, birth.getUTCDate()));
}

function interpolate(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return (1 + erf) / 2;
}
