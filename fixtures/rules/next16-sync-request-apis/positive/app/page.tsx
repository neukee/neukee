// Synchronous access to a request API: an error in Next.js 16.
import { cookies } from "next/headers";

export default function Page() {
  const theme = cookies().get("theme");
  return <p>{theme?.value}</p>;
}
