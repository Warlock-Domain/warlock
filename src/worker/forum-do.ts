import { DurableObject } from 'cloudflare:workers';

// One named instance ('forum') will hold all forum data in SQLite (migration v2). Step 2 of issue #366 dropped the skeleton's
// open notes table; topics, posts and votes arrive with step 3.
export class Forum extends DurableObject<Env> {}
