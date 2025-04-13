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
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import Image from "next/image";

function Page() {
  const [isOpen, setIsOpen] = useState(true);
  const router = useRouter();
  
  function handleClose() {
    setIsOpen(false);
    router.push("/");
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-200 text-black">
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex size-11 shrink-0 items-center justify-center"
            aria-hidden="true"
          ></div>
          <DialogHeader>
            <div className="flex items-center justify-center">
                <Image className="flex justify-center" src="/logoniabs.svg" alt="Arruuuyyy" width={50} height={50}/>
            </div>
            <DialogTitle className="sm:text-center">Sign Up AI</DialogTitle>
            <DialogDescription className="sm:text-center">
              We just need a few details to get you started.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <Input placeholder="Username" required />
            </div>
            <div className="space-y-2">
              <Input placeholder="Email" required />
            </div>
            <div className="space-y-2">
              <Input type="password" placeholder="Password" required />
            </div>
            <div className="space-y-2">
              <Input type="password" placeholder="Confirm Password" required />
            </div>
          </div>
          <div className="flex justify-center">
            <Button type="submit" className="w-64">Create Account</Button>
          </div>
        </form>

        <div className="flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <span className="text-xs text-muted-foreground">Or</span>
        </div>
        <Button variant="outline">Continue with Google</Button>
        <p className="text-center text-xs text-muted-foreground">

          <Link href='/auth/signin' className="underline hover:no-underline">
          Already have an account
          </Link>
        </p>

      </DialogContent>
    </Dialog>
  );
}

export default Page;
