import { parseRecordingsResponse, type RawRecording } from "./protobuf";

const BASE_URL = process.env.CX_BASE_URL!;
const CX_USERNAME = process.env.CX_USERNAME!;
const CX_PASSWORD = process.env.CX_PASSWORD!;

type TokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
};

type SessionResponse = {
  sessionKey: string;
  pass: string;
  version: string;
};

async function fetchInsecure(
  url: string,
  init?: RequestInit
): Promise<Response> {
  // Node 18+ supports this via env, but we use it inline for clarity
  return fetch(url, {
    ...init,
    // @ts-expect-error -- Node.js specific TLS option
    agent: undefined,
  });
}

export class ThreeCXClient {
  private accessToken: string | null = null;
  private sessionId: string | null = null;
  private cookies: string[] = [];

  async login(): Promise<void> {
    // Step 1: username + password
    const r1 = await fetch(`${BASE_URL}/webclient/api/Login/GetAccessToken`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        ReCaptchaResponse: null,
        SecurityCode: "",
        Password: CX_PASSWORD,
        Username: CX_USERNAME,
      }),
    });
    if (!r1.ok)
      throw new Error(`3CX login step 1 failed: ${r1.status} ${await r1.text()}`);

    // Capture cookies (RefreshTokenCookie)
    const setCookies = r1.headers.getSetCookie?.() ?? [];
    this.cookies = setCookies.map((c) => c.split(";")[0]);

    // Step 2: exchange for bearer token
    const r2 = await fetch(`${BASE_URL}/connect/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
        cookie: this.cookies.join("; "),
      },
      body: "client_id=Webclient&grant_type=refresh_token",
    });
    if (!r2.ok)
      throw new Error(`3CX login step 2 failed: ${r2.status} ${await r2.text()}`);

    const tokenData: TokenResponse = await r2.json();
    this.accessToken = tokenData.access_token;

    // Step 3: get MyPhone session
    const r3 = await fetch(`${BASE_URL}/webclient/api/MyPhone/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        cookie: this.cookies.join("; "),
      },
      body: JSON.stringify({
        name: "Webclient",
        version: "20.0.7.1060",
        isHuman: true,
      }),
    });
    if (!r3.ok)
      throw new Error(`3CX login step 3 failed: ${r3.status} ${await r3.text()}`);

    const sessionData: SessionResponse = await r3.json();
    this.sessionId = sessionData.sessionKey;
  }

  async getRecordingsList(): Promise<RawRecording[]> {
    const payload = new Uint8Array([
      0x08, 0xb8, 0x01, 0xc2, 0x0b, 0x10, 0x28, 0x00, 0x30, 0x50, 0x4a,
      0x06, 0x0a, 0x00, 0x12, 0x00, 0x1a, 0x00, 0x50, 0x00, 0x5a, 0x00,
    ]);

    const r = await fetch(`${BASE_URL}/MyPhone/MPWebService.asmx`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        accept: "application/octet-stream",
        myphonesession: this.sessionId!,
        cookie: this.cookies.join("; "),
      },
      body: payload,
    });
    if (!r.ok) throw new Error(`MPWebService failed: ${r.status}`);

    const buf = new Uint8Array(await r.arrayBuffer());
    return parseRecordingsResponse(buf);
  }

  async downloadRecording(recordingId: number): Promise<ArrayBuffer> {
    const url = `${BASE_URL}/MyPhone/downloadRecording/${recordingId}?sessionId=${this.sessionId}`;
    const r = await fetch(url, {
      headers: { cookie: this.cookies.join("; ") },
    });
    if (!r.ok)
      throw new Error(`Download ${recordingId} failed: ${r.status}`);
    return r.arrayBuffer();
  }
}
