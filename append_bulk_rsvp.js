const fs = require('fs');
const path = './src/actions/events.ts';
let content = fs.readFileSync(path, 'utf8');

const bulkFn = `

export async function getBulkEventRSVPs(
  eventIds: string[],
  currentUserId?: string
): Promise<Record<string, EventRSVPData>> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    const isAdminOrMod = role === "admin" || role === "moderator";
    const effectiveUserId = currentUserId || session?.user?.id;

    if (!eventIds.length) return {};

    const pipeline = redis.pipeline();
    for (const id of eventIds) {
      pipeline.hgetall(\`event:\${id}:rsvps\`);
    }
    const rsvpResults = await pipeline.exec();

    const result: Record<string, EventRSVPData> = {};
    const adminFetchMembers = new Set<string>();

    eventIds.forEach((eventId, index) => {
      const rsvps = rsvpResults[index] as Record<string, string> | null;
      let goingCount = 0;
      let maybeCount = 0;
      let cantGoCount = 0;
      let userRSVP: RSVPStatus | null = null;
      const goingUserIds: string[] = [];

      if (rsvps && Object.keys(rsvps).length > 0) {
        for (const [uid, status] of Object.entries(rsvps)) {
          const st = status as RSVPStatus;
          if (uid === effectiveUserId) userRSVP = st;
          
          if (st === "going") {
            goingCount++;
            goingUserIds.push(uid);
          } else if (st === "maybe") {
            maybeCount++;
          } else if (st === "cant_go") {
            cantGoCount++;
          }
        }
      }

      if (isAdminOrMod) {
        goingUserIds.slice(0, 10).forEach(uid => adminFetchMembers.add(uid));
      }

      result[eventId] = {
        goingCount,
        maybeCount,
        cantGoCount,
        userRSVP,
        goingMembers: [],
        ...(isAdminOrMod ? { _goingUserIds: goingUserIds.slice(0, 10) } : {})
      } as any;
    });

    if (isAdminOrMod && adminFetchMembers.size > 0) {
      const memberIds = Array.from(adminFetchMembers);
      const memberPipeline = redis.pipeline();
      for (const uid of memberIds) {
        memberPipeline.hgetall(\`member:\${uid}\`);
      }
      const memberResults = await memberPipeline.exec();
      
      const memberMap = new Map<string, RSVPMember>();
      memberIds.forEach((uid, index) => {
        const data = memberResults[index] as any;
        if (data) {
          memberMap.set(uid, {
            userId: uid,
            name: data.name || data.nickname || "Member",
            avatar: data.customAvatar || data.image || undefined,
          });
        }
      });

      for (const eventId of eventIds) {
        const item = result[eventId] as any;
        if (item._goingUserIds) {
          item.goingMembers = item._goingUserIds.map((uid: string) => memberMap.get(uid)).filter(Boolean);
          delete item._goingUserIds;
        }
      }
    }

    return result;
  } catch (error) {
    console.error("getBulkEventRSVPs error:", error);
    return {};
  }
}
`;

content += bulkFn;
fs.writeFileSync(path, content);
console.log("Appended getBulkEventRSVPs");
