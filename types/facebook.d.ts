interface FBLoginResponse {
  authResponse?: {
    /** ไม่มาเมื่อขอแบบ `response_type: 'code'` (Facebook Login for Business · token แบบ System-business) */
    accessToken?: string;
    /** มาเฉพาะแบบ `response_type: 'code'` — เซิร์ฟเวอร์เอาไปแลก token เอง */
    code?: string;
    expiresIn: number;
    signedRequest: string;
    userID: string;
  };
  status: string;
}

interface FBInitParams {
  appId: string;
  cookie?: boolean;
  xfbml?: boolean;
  version: string;
}

interface FBLoginOptions {
  /** Facebook Login แบบเดิม — รายชื่อสิทธิ์คั่นด้วย , */
  scope?: string;
  auth_type?: string;
  /** Facebook Login for Business — รหัส configuration จาก App Dashboard (ใช้แทน scope) */
  config_id?: string;
  response_type?: 'code';
  override_default_response_type?: boolean;
}

interface FB {
  init(params: FBInitParams): void;
  login(callback: (response: FBLoginResponse) => void, options?: FBLoginOptions): void;
  logout(callback?: () => void): void;
  getLoginStatus(callback: (response: FBLoginResponse) => void): void;
}

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: FB;
  }
}

export {};
