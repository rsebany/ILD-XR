import { apiFetch } from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type {
  AuthResponse,
  ForgotPasswordResponse,
  LoginRequest,
  ResetPasswordRequest,
  SignupRequest,
  User,
} from "../domain";

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(joinRoute(ROUTES.auth, "login"), {
    method: "POST",
    body: payload,
  });
}

export async function signup(payload: SignupRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(joinRoute(ROUTES.auth, "signup"), {
    method: "POST",
    body: payload,
  });
}

export async function fetchMe(): Promise<User> {
  return apiFetch<User>(joinRoute(ROUTES.auth, "me"), {
    method: "GET",
  });
}

export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>(
    joinRoute(ROUTES.auth, "forgot-password"),
    {
      method: "POST",
      body: { email },
    },
  );
}

export async function resetPassword(
  payload: ResetPasswordRequest,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    joinRoute(ROUTES.auth, "reset-password"),
    {
      method: "POST",
      body: payload,
    },
  );
}
