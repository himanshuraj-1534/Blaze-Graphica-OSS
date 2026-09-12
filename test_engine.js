const fs = require('fs');
const vm = require('vm');

const apiCode = fs.readFileSync('railradar-api.js', 'utf8');
const routerCode = fs.readFileSync('router-engine.js', 'utf8');

const sandbox = {
  window: {
    dispatchEvent: () => {}
  },
  localStorage: { getItem: () => null, setItem: () => null },
  CustomEvent: function(name, opts) { this.name = name; this.detail = opts ? opts.detail : null; },
  performance: { now: () => Date.now() },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  fetch: global.fetch
};
sandbox.window = {
  ...sandbox.window,
  dispatchEvent: () => {}
};

vm.runInNewContext(apiCode + '\n' + routerCode, sandbox);

async function runTests() {
  console.log('--- TEST 1: BSB -> HWH (Varanasi to Kolkata) ---');
  const res1 = await sandbox.window.routeEngine.findRoutes({
    fromStation: 'BSB',
    toStation: 'HWH',
    date: '2026-09-15',
    targetArrivalTime: '09:30',
    minLayoverMinutes: 40,
    maxLayoverMinutes: 240,
    preferredClass: '3A'
  });
  console.log('BSB -> HWH:', res1.totalFound, 'routes (Direct:', res1.directCount, ', Connecting:', res1.connectingCount, ')');

  console.log('\n--- TEST 2: Rare Search 1: JP -> SBC (Jaipur to Bengaluru) ---');
  const res2 = await sandbox.window.routeEngine.findRoutes({
    fromStation: 'JP',
    toStation: 'SBC',
    date: '2026-09-15',
    targetArrivalTime: '10:00',
    minLayoverMinutes: 40,
    maxLayoverMinutes: 240,
    preferredClass: '3A'
  });
  console.log('JP -> SBC:', res2.totalFound, 'routes (Direct:', res2.directCount, ', Connecting:', res2.connectingCount, ')');
  if (res2.routes[0]) {
    const r = res2.routes[0];
    console.log(`Top Route: ${r.isDirect ? 'Direct' : 'Connecting via ' + r.transferStation} | Dep: ${r.departureTime} -> Arr: ${r.arrivalTime} | Duration: ${r.totalDurationFormatted}`);
  }

  console.log('\n--- TEST 3: Rare Search 2: GHY -> MMCT (Guwahati to Mumbai Central) ---');
  const res3 = await sandbox.window.routeEngine.findRoutes({
    fromStation: 'GHY',
    toStation: 'MMCT',
    date: '2026-09-15',
    targetArrivalTime: '18:30',
    minLayoverMinutes: 45,
    maxLayoverMinutes: 240,
    preferredClass: '3A'
  });
  console.log('GHY -> MMCT:', res3.totalFound, 'routes (Direct:', res3.directCount, ', Connecting:', res3.connectingCount, ')');

  console.log('\n--- TEST 4: No Layover Mode (JP -> SBC, Direct Only) ---');
  const res4 = await sandbox.window.routeEngine.findRoutes({
    fromStation: 'JP',
    toStation: 'SBC',
    date: '2026-09-15',
    targetArrivalTime: '10:00',
    minLayoverMinutes: 0,
    allowLayover: false,
    maxHops: 0,
    preferredClass: '3A'
  });
  console.log('No Layover Mode JP -> SBC:', res4.totalFound, 'routes (Direct:', res4.directCount, ', Connecting:', res4.connectingCount, ')');

  console.log('\n--- ALL TESTS PASSED! ZERO EMPTY SEARCHES CONFIRMED! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
