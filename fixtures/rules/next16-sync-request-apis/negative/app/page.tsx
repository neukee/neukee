// The same page, awaited: valid in Next.js 16.
import { cookies } from "next/headers";

export default async function Page() {
  const theme = (await cookies()).get("theme");
  return <p>{theme?.value}</p>;
}
