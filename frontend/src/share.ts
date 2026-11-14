type ShareBrowser = {
  share?: (data: { title: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};
export async function deliverTripLink(url: string, browser: ShareBrowser): Promise<'shared' | 'copied' | 'cancelled' | 'unsupported'> {
  if (browser.share) {
    try { await browser.share({ title: '함께 가고 싶은 반려동물 여행 코스', url }); return 'shared'; }
    catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      if (!browser.clipboard) throw e;
    }
  }
  if (!browser.clipboard) return 'unsupported';
  await browser.clipboard.writeText(url);
  return 'copied';
}
