import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import { supabaseOAuthIssuer } from "@/src/lib/supabase-server";

const handler = protectedResourceHandler({
  authServerUrls: [supabaseOAuthIssuer()],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
