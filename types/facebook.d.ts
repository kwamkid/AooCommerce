interface FBLoginResponse {
  authResponse?: {
    accessToken: string;
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

interface FB {
  init(params: FBInitParams): void;
  login(callback: (response: FBLoginResponse) => void, options?: { scope: string }): void;
  getLoginStatus(callback: (response: FBLoginResponse) => void): void;
}

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: FB;
  }
}

export {};
