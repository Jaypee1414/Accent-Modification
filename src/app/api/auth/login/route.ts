import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { sign } from "jsonwebtoken";

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(req: Request) {
  const SECRET_KEY = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;

  try {
    // Parse the request body as JSON and type it
    const { email, password }: LoginRequest = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Compare hashed password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Generate JWT token
    const token = sign(
      { id: user.id, email: user.email },
      SECRET_KEY as string, // Ensuring SECRET_KEY is always a string
      { expiresIn: "1d" }
    );

    // Set token in HTTP-only cookie
    const response = NextResponse.json({ message: "Login successful", user });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
