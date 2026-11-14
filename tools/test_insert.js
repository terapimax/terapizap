const url = 'https://ezphizbbgjrfwbucaoun.supabase.co/rest/v1/';
const key = 'sb_publishable_Xd9bXGi5d88Tpc2L5-gy0A_Zab_9yYy';
// generate dummy UUID
const userId = '00000000-0000-0000-0000-000000000000'; 
const headers = { 
  'apikey': key, 
  'Authorization': `Bearer ${key}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function testInsert() {
  try {
    // try to insert an invalid token but just to get the API error message
    const res = await fetch(url + 'messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Test', content: 'test', is_favorite: false, user_id: userId })
    });
    console.log('messages HTTP status:', res.status);
    console.log('messages Response:', await res.json());

    // try kanban_columns
    const res2 = await fetch(url + 'kanban_columns', {
       method: 'POST',
       headers,
       body: JSON.stringify({ title: 'Test Col', board_id: 1, user_id: userId, position: 1 })
    });
    console.log('kanban_columns status:', res2.status);
    console.log('kanban_columns:', await res2.json());

  } catch (e) {
    console.error(e);
  }
}
testInsert();
