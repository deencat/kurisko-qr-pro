import { NextResponse } from "next/server";
import { buildKuriskoMatrix } from "@/lib/kurisko/snapshot/build-matrix";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") ?? "US500").toUpperCase();

    const matrix = await buildKuriskoMatrix(symbol);
    return NextResponse.json(matrix);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kurisko matrix failed" },
      { status: 500 }
    );
  }
}
