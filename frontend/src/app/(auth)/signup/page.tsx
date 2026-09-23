import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Create your account · fraud.auth",
};

export default function SignUpPage() {
  return <AuthForm mode="signup" />;
}
