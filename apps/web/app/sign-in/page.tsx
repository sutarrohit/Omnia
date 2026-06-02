import { AuthForm } from "@/components/auth-form";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <AuthForm mode="sign-in" />
    </div>
  );
}
