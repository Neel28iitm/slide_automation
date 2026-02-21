import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

// Proxy all /api/* requests to Python FastAPI backend
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const url = `${BACKEND}/api/${path}${req.nextUrl.search}`;
  try {
    const res = await fetch(url, { headers: req.headers });
    return new NextResponse(res.body, { status: res.status, headers: res.headers });
  } catch (e) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const url = `${BACKEND}/api/${path}`;

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart")) {
      // For multipart uploads (audio, files): stream the raw body directly
      // instead of re-parsing FormData, which loses file metadata
      const rawBody = await req.arrayBuffer();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": contentType, // Pass the original content-type with boundary
        },
        body: rawBody,
      });
      return new NextResponse(res.body, { status: res.status, headers: res.headers });
    } else {
      // JSON body
      const body = await req.text();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
      });
      return new NextResponse(res.body, { status: res.status, headers: res.headers });
    }
  } catch (e) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const url = `${BACKEND}/api/${path}`;
  try {
    const res = await fetch(url, { method: "DELETE", headers: req.headers });
    return new NextResponse(res.body, { status: res.status, headers: res.headers });
  } catch (e) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
