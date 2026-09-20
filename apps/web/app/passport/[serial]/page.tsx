import { PassportClient } from "@/components/passport-client";

export default async function PassportPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  return <PassportClient serial={decodeURIComponent(serial)} />;
}
