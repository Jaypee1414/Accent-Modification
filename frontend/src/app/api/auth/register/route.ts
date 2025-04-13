import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

export async function POST(req : Request) {
  try {
    const { username, email, password } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, password: hashedPassword },
    });

    return NextResponse.json({ message: "User registered",  user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Something went wrong", message: error }, { status: 500 });
  }
}
