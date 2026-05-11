export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface IAuthResult {
  user: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string;
  };
  access_token: string;
  refresh_token: string;
}
