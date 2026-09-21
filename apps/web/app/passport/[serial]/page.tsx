import { PassportClient } from "@/components/passport-client";

export default async function PassportPage({ params, searchParams }: { params: Promise<{ serial: string }>; searchParams: Promise<{ certificate?: string }> }) {
  const { serial } = await params;
  const { certificate } = await searchParams;
  return <PassportClient serial={decodeURIComponent(serial)} certificate={certificate} />;
}
