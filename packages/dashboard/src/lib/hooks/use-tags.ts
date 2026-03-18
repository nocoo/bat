"use client";

import type { TagItem } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

export function useTags() {
	return useSWR<TagItem[]>("tags", () => fetchAPI<TagItem[]>("/api/tags"));
}
