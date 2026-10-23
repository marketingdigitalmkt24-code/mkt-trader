export function reusableDemoSession(serviceAuthorized: boolean, configId: string, session?: { configId: string; ssid: string }) {
  return serviceAuthorized && session?.configId === configId && session.ssid.length > 0 ? session.ssid : null;
}