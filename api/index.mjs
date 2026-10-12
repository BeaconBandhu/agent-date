import { handler, ready } from "../lib/app.mjs";
export const config = { maxDuration: 60 };
export default async function (req, res) {
  await ready;
  return handler(req, res);
}
