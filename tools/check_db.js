const url = 'https://ezphizbbgjrfwbucaoun.supabase.co/rest/v1/';
const key = 'sb_publishable_Xd9bXGi5d88Tpc2L5-gy0A_Zab_9yYy';
const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

async function check() {
  try {
    const res = await fetch(url + 'kanban_columns?select=*&limit=1', { headers });
    console.log('kanban_columns:', await res.json());

    const res2 = await fetch(url + 'media_library?select=*&limit=1', { headers });
    console.log('media_library:', await res2.json());
  } catch (e) {
    console.error(e);
  }
}
check();
