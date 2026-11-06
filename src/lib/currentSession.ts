import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// React scopes this memoization to one server render, never across users/requests.
// API Route Handlers keep their own session checks.
export const getCurrentSession = cache(() => getServerSession(authOptions));
