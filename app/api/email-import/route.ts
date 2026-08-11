import { NextRequest, NextResponse } from "next/server";
import { createGmailClient, searchCardEmails } from "@/lib/gmail-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EMAIL_PARSERS } from "@/lib/email-parsers";
import { runEmailImport } from "@/lib/email-import/run-email-import";

export async function POST(request: NextRequest) {
  const secret = process.env.EMAIL_IMPORT_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const gmail = createGmailClient();
    const senderAddresses = Object.keys(EMAIL_PARSERS);
    const emails = await searchCardEmails(gmail, senderAddresses);

    const supabase = createServerSupabaseClient();
    const summary = await runEmailImport(emails, supabase);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("メール自動取込に失敗しました:", error);
    return NextResponse.json(
      { error: "メール自動取込に失敗しました。" },
      { status: 500 }
    );
  }
}
