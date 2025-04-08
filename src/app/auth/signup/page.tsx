"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
function page() {
  return (
    <Dialog>
      <DialogContent className="bg-slate-200 text-black">
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex size-11 shrink-0 items-center justify-center"
            aria-hidden="true"
          ></div>
          <DialogHeader>
            <DialogTitle className="sm:text-center">Sign in AI</DialogTitle>
            <DialogDescription className="sm:text-center">
              We just need a few details to get you started.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`email`}>Email</label>
              <input placeholder="hi@yourcompany.com" required />
            </div>
            <div className="space-y-2">
              <label htmlFor={`password`}>Password</label>
              <input type="password" placeholder="Password" required />
            </div>
          </div>

          <Button type="submit"></Button>
        </form>

        <div className="flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <span className="text-xs text-muted-foreground">Or</span>
        </div>
        <Button variant="outline">Continue with Google</Button>
        <p className="text-center text-xs text-muted-foreground">
          Don't have an account?{" "}
          <Link href="youtube.com" className="underline hover:no-underline">
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to our{" "}
          <a className="underline hover:no-underline" href="#">
            Terms
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default page;
