const FB_API = "https://graph.facebook.com/v19.0";

export interface RawFacebookPost {
  id: string;
  message?: string;
  created_time: string;
  full_picture?: string;
  attachments?: {
    data: Array<{
      type: string;
      media?: { image?: { src: string } };
      subattachments?: {
        data: Array<{ media?: { image?: { src: string } }; type: string }>;
      };
    }>;
  };
}

export async function getPageFeed(limit = 20): Promise<RawFacebookPost[]> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    throw new Error("Facebook configuration missing");
  }

  const response = await fetch(
    `${FB_API}/${pageId}/feed?fields=id,message,created_time,full_picture,attachments&limit=${limit}&access_token=${token}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Facebook API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

export async function publishPost(
  message: string,
  imageUrls?: string[]
): Promise<{ id: string }> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    throw new Error("Facebook configuration missing");
  }

  if (imageUrls && imageUrls.length > 0) {
    // Upload photos first (unpublished), then create multi-photo post
    const photoIds = await Promise.all(
      imageUrls.map(async (url) => {
        const res = await fetch(`${FB_API}/${pageId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, published: false, access_token: token }),
        });
        if (!res.ok) throw new Error(`Photo upload failed: ${res.status}`);
        const data = await res.json();
        return data.id;
      })
    );

    const res = await fetch(`${FB_API}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        access_token: token,
      }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(
        errorData.error?.message || `Publish failed: ${res.status}`
      );
    }
    return res.json();
  }

  // Text-only post
  const res = await fetch(`${FB_API}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(
      errorData.error?.message || `Publish failed: ${res.status}`
    );
  }
  return res.json();
}
