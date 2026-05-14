import newrelic from 'newrelic';

const a = newrelic.agent;
// eslint-disable-next-line no-console
console.log('diag agent_enabled', a?.config?.agent_enabled);
// eslint-disable-next-line no-console
console.log('diag app_name', a?.config?.app_name);
// eslint-disable-next-line no-console
console.log('diag collector host', a?.config?.host);
// eslint-disable-next-line no-console
console.log('diag license_key set', Boolean(a?.config?.license_key));

newrelic.recordCustomEvent('DiagTest', { probe: 1, source: 'now-playing-diag' });

await new Promise((r) => setTimeout(r, 12_000));
// eslint-disable-next-line no-console
console.log('diag done');
