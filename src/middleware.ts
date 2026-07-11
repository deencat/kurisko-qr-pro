import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/day-trade(.*)",
  "/kurisko-scanner(.*)",
  "/scan/qr(.*)",
  "/api/kurisko(.*)",
  "/api/capital(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return;
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx|map|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
