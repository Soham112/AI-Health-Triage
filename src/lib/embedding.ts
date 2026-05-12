// Semantic search via Supabase pgvector
// Stores chat messages as vector embeddings for similarity retrieval

import { getServiceClient } from './supabase';

// Simple TF-IDF-style word vector for demo (production: use OpenAI/Cohere embeddings)
// In production, replace generateEmbedding() with API call to embedding model
function generateEmbedding(text: string): number[] {
  const VOCAB_SIZE = 1536;
  const embedding = new Array(VOCAB_SIZE).fill(0);

  const words = text.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % VOCAB_SIZE;
    embedding[index] += 1 / words.length;
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return embedding.map(v => v / magnitude);
  }
  return embedding;
}

export async function storeChatEmbedding(opts: {
  memberId: string;
  message: string;
  response: string;
  chatId: string;
}): Promise<void> {
  try {
    const client = getServiceClient();
    const embedding = generateEmbedding(opts.message + ' ' + opts.response);

    await client.from('chat_history').update({ embedding }).eq('id', opts.chatId);
  } catch {
    // Embedding storage is non-critical — fail silently
    console.debug('[Embedding] Storage skipped — Supabase not configured');
  }
}

export async function findSimilarConversations(opts: {
  memberId: string;
  query: string;
  limit?: number;
}): Promise<Array<{ message: string; response: string; similarity: number }>> {
  try {
    const client = getServiceClient();
    const queryEmbedding = generateEmbedding(opts.query);

    const { data, error } = await client.rpc('match_chat_history', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: opts.limit || 5,
      p_member_id: opts.memberId,
    });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
