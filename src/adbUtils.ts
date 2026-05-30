import Adb from '@devicefarmer/adbkit';
import { AppInfo, APP_DB, HIDDEN_PACKAGES, resolveApp } from './appUtils';

// ── ADB client ───────────────────────────────────────────────────────────────
export const adbClient = Adb.createClient();

export async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stream.on('error', reject);
  });
}

// Fetch nonLocalizedLabel from pm dump for packages not in APP_DB, in one shell call
export async function fetchLabelsFromDevice(
  device: ReturnType<typeof adbClient.getDevice>,
  packages: string[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (!packages.length) return labels;

  // Build a single shell script: for each pkg, print a marker then grep the dump
  const script = packages
    .map(p => `echo "__PKG__${p}"; pm dump "${p}" 2>/dev/null | grep "nonLocalizedLabel" | head -1`)
    .join('; ');

  const stream = await device.shell(script);
  const output = await readStream(stream);

  let currentPkg = '';
  for (const line of output.split('\n')) {
    if (line.startsWith('__PKG__')) {
      currentPkg = line.slice(7).trim();
    } else if (currentPkg && line.includes('nonLocalizedLabel=')) {
      const val = line.split('=')[1]?.trim();
      if (val && val !== 'null' && val !== '0') {
        labels.set(currentPkg, val);
      }
    }
  }
  return labels;
}

export async function listTvApps(host: string): Promise<AppInfo[]> {
  const serial = `${host}:5555`;
  await adbClient.connect(host, 5555);

  const device = adbClient.getDevice(serial);
  const stream = await device.shell(
    'pm query-activities --components -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER'
  );
  const output = await readStream(stream);

  const seen = new Set<string>();
  const raw: Array<{ package: string; component: string }> = [];

  for (const line of output.split('\n')) {
    const m = line.match(/\b([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_][a-zA-Z0-9_]*)+)(\/[^\s]+)/);
    if (!m) continue;
    const pkg = m[1];
    if (seen.has(pkg)) continue;
    if (pkg === 'android' || pkg.startsWith('com.android.') || pkg === 'com.google.android.tv') continue;
    if (HIDDEN_PACKAGES.has(pkg)) continue;
    seen.add(pkg);
    raw.push({ package: pkg, component: `${pkg}${m[2]}` });
  }

  // For packages not in the static map, ask the device for the real label
  const unknown = raw.map(a => a.package).filter(p => !Object.prototype.hasOwnProperty.call(APP_DB, p));
  const deviceLabels = await fetchLabelsFromDevice(device, unknown).catch(() => new Map<string, string>());

  const apps: AppInfo[] = raw.map(({ package: pkg, component }) => {
    const { name, color } = resolveApp(pkg, deviceLabels);
    return { package: pkg, component, name, color };
  });

  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

export async function launchApp(host: string, component: string): Promise<void> {
  const serial = `${host}:5555`;
  const device = adbClient.getDevice(serial);
  await device.startActivity({
    action: 'android.intent.action.MAIN',
    category: 'android.intent.category.LEANBACK_LAUNCHER',
    component,
    wait: false,
  } as Parameters<typeof device.startActivity>[0]);
}
