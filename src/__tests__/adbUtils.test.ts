import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

// ── Mock @devicefarmer/adbkit ─────────────────────────────────────────────────
// vi.hoisted ensures these variables are initialised before any module import.
const { mockShell, mockStartActivity, mockConnect, mockGetDevice } = vi.hoisted(() => {
  const mockShell = vi.fn();
  const mockStartActivity = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue('192.168.1.100:5555');
  const mockGetDevice = vi.fn(() => ({
    shell: mockShell,
    startActivity: mockStartActivity,
  }));
  return { mockShell, mockStartActivity, mockConnect, mockGetDevice };
});

vi.mock('@devicefarmer/adbkit', () => ({
  default: {
    createClient: () => ({
      connect: mockConnect,
      getDevice: mockGetDevice,
    }),
  },
}));

// Import after mock is established
import { readStream, fetchLabelsFromDevice, listTvApps, launchApp, adbClient } from '../adbUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStream(content: string): Readable {
  return Readable.from([Buffer.from(content)]);
}

function makeEmptyStream(): Readable {
  return Readable.from([]);
}

function makeErrorStream(message: string): Readable {
  const stream = new Readable({ read() {} });
  setImmediate(() => stream.destroy(new Error(message)));
  return stream;
}

// ── readStream ────────────────────────────────────────────────────────────────

describe('readStream', () => {
  it('collects chunks into a string', async () => {
    const stream = Readable.from([Buffer.from('hello'), Buffer.from(' world')]);
    const result = await readStream(stream);
    expect(result).toBe('hello world');
  });

  it('handles an empty stream', async () => {
    const result = await readStream(makeEmptyStream());
    expect(result).toBe('');
  });

  it('rejects when the stream emits an error', async () => {
    const stream = makeErrorStream('stream failure');
    await expect(readStream(stream)).rejects.toThrow('stream failure');
  });
});

// ── fetchLabelsFromDevice ─────────────────────────────────────────────────────

describe('fetchLabelsFromDevice', () => {
  beforeEach(() => {
    mockShell.mockReset();
  });

  it('returns an empty Map for an empty package list without calling shell', async () => {
    const device = adbClient.getDevice('192.168.1.100:5555');
    const result = await fetchLabelsFromDevice(device, []);
    expect(result.size).toBe(0);
    expect(mockShell).not.toHaveBeenCalled();
  });

  it('parses nonLocalizedLabel from pm dump output', async () => {
    const pmOutput = [
      '__PKG__com.example.app',
      '    nonLocalizedLabel=My Example App',
    ].join('\n');
    mockShell.mockResolvedValueOnce(makeStream(pmOutput));

    const device = adbClient.getDevice('192.168.1.100:5555');
    const result = await fetchLabelsFromDevice(device, ['com.example.app']);

    expect(result.get('com.example.app')).toBe('My Example App');
  });

  it('excludes labels with value "null"', async () => {
    const pmOutput = [
      '__PKG__com.example.nullapp',
      '    nonLocalizedLabel=null',
    ].join('\n');
    mockShell.mockResolvedValueOnce(makeStream(pmOutput));

    const device = adbClient.getDevice('192.168.1.100:5555');
    const result = await fetchLabelsFromDevice(device, ['com.example.nullapp']);

    expect(result.has('com.example.nullapp')).toBe(false);
  });

  it('excludes labels with value "0"', async () => {
    const pmOutput = [
      '__PKG__com.example.zeroapp',
      '    nonLocalizedLabel=0',
    ].join('\n');
    mockShell.mockResolvedValueOnce(makeStream(pmOutput));

    const device = adbClient.getDevice('192.168.1.100:5555');
    const result = await fetchLabelsFromDevice(device, ['com.example.zeroapp']);

    expect(result.has('com.example.zeroapp')).toBe(false);
  });

  it('handles multiple packages in one shell call', async () => {
    const pmOutput = [
      '__PKG__com.foo.one',
      '    nonLocalizedLabel=Foo One',
      '__PKG__com.bar.two',
      '    nonLocalizedLabel=Bar Two',
    ].join('\n');
    mockShell.mockResolvedValueOnce(makeStream(pmOutput));

    const device = adbClient.getDevice('192.168.1.100:5555');
    const result = await fetchLabelsFromDevice(device, ['com.foo.one', 'com.bar.two']);

    expect(result.get('com.foo.one')).toBe('Foo One');
    expect(result.get('com.bar.two')).toBe('Bar Two');
  });
});

// ── listTvApps ────────────────────────────────────────────────────────────────

// Realistic pm query-activities output format:
//   <indent> <hash> <pkg>/<activity> filter <hash2>
const PM_QUERY_OUTPUT = [
  '        abc123 com.netflix.ninja/.activity.AppActivity filter def456',
  '        abc124 com.hulu.plus/.tv.MainActivity filter def457',
  '        abc125 com.unknownapp.player/.MainActivity filter def458',
  '        abc126 com.android.settings/.Settings filter def459',        // should be filtered
  '        abc127 com.google.android.play.games/.Activity filter def',  // HIDDEN_PACKAGES
  '        abc128 com.google.android.videos/.Activity filter def',      // HIDDEN_PACKAGES
  '        abc129 com.unknownapp.player/.MainActivity filter def460',   // duplicate — should dedup
].join('\n');

describe('listTvApps', () => {
  beforeEach(() => {
    mockShell.mockReset();
    mockConnect.mockResolvedValue('192.168.1.100:5555');
  });

  it('returns apps with correct names from APP_DB', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))   // pm query-activities
      .mockResolvedValueOnce(makeStream(''));                 // pm dump for unknowns (empty)

    const apps = await listTvApps('192.168.1.100');
    const names = apps.map(a => a.name);
    expect(names).toContain('Netflix');
    expect(names).toContain('Hulu');
  });

  it('filters out HIDDEN_PACKAGES', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(''));

    const apps = await listTvApps('192.168.1.100');
    const pkgs = apps.map(a => a.package);
    expect(pkgs).not.toContain('com.google.android.play.games');
    expect(pkgs).not.toContain('com.google.android.videos');
  });

  it('filters out core android/com.android.* packages', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(''));

    const apps = await listTvApps('192.168.1.100');
    const pkgs = apps.map(a => a.package);
    expect(pkgs).not.toContain('com.android.settings');
  });

  it('deduplicates packages that appear multiple times', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(''));

    const apps = await listTvApps('192.168.1.100');
    const pkgs = apps.map(a => a.package);
    const uniquePkgs = new Set(pkgs);
    expect(pkgs.length).toBe(uniquePkgs.size);
  });

  it('sorts results alphabetically by name', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(''));

    const apps = await listTvApps('192.168.1.100');
    const names = apps.map(a => a.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('uses device labels for packages not in APP_DB', async () => {
    const pmDumpOutput = [
      '__PKG__com.unknownapp.player',
      '    nonLocalizedLabel=Unknown Streaming App',
    ].join('\n');

    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(pmDumpOutput));

    const apps = await listTvApps('192.168.1.100');
    const unknown = apps.find(a => a.package === 'com.unknownapp.player');
    expect(unknown?.name).toBe('Unknown Streaming App');
  });

  it('uses fallback name when neither APP_DB nor device label is available', async () => {
    mockShell
      .mockResolvedValueOnce(makeStream(PM_QUERY_OUTPUT))
      .mockResolvedValueOnce(makeStream(''));  // no labels returned

    const apps = await listTvApps('192.168.1.100');
    const unknown = apps.find(a => a.package === 'com.unknownapp.player');
    // fallbackName('com.unknownapp.player') skips 'com', 'player' and picks 'unknownapp'
    expect(unknown?.name).toBe('Unknownapp');
  });
});

// ── launchApp ─────────────────────────────────────────────────────────────────

describe('launchApp', () => {
  beforeEach(() => {
    mockStartActivity.mockReset();
    mockStartActivity.mockResolvedValue(true);
  });

  it('calls startActivity with correct action', async () => {
    await launchApp('192.168.1.100', 'com.netflix.ninja/.activity.AppActivity');
    expect(mockStartActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'android.intent.action.MAIN',
      })
    );
  });

  it('calls startActivity with correct category', async () => {
    await launchApp('192.168.1.100', 'com.netflix.ninja/.activity.AppActivity');
    expect(mockStartActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'android.intent.category.LEANBACK_LAUNCHER',
      })
    );
  });

  it('calls startActivity with correct component', async () => {
    const component = 'com.netflix.ninja/.activity.AppActivity';
    await launchApp('192.168.1.100', component);
    expect(mockStartActivity).toHaveBeenCalledWith(
      expect.objectContaining({ component })
    );
  });

  it('uses the correct ADB serial (host:5555)', async () => {
    await launchApp('192.168.1.100', 'com.example/.Activity');
    expect(mockGetDevice).toHaveBeenCalledWith('192.168.1.100:5555');
  });
});
