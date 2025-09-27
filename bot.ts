import { AtpAgent } from "@atproto/api";
import "dotenv/config";
import * as fs from "fs";
import { DateTime } from "luxon";
import * as path from "path";

type Event = {
	created_at: string;
	endtime?: string;
	id: number;
	imageurl?: string;
	location: string;
	maxprice?: string;
	minprice?: string;
	price: string;
	pricedescription: any;
	source: string;
	starttime?: string;
	title: string;
};

const getImageEmbed = async (agent: AtpAgent, event: Event) => {
	let embed = undefined;

	if (event.imageurl) {
		try {
			const response = await fetch(event.imageurl);
			const buffer = await response.arrayBuffer();
			const uInt8Array = new Uint8Array(buffer);
			const fileExtension = event.imageurl
				.match(/\.(jpg|jpeg|png|webp)$/i)?.[1]
				.toLowerCase();
			const uploadResult = await agent.uploadBlob(uInt8Array, {
				encoding: `image/${
					fileExtension === "jpg" ? "jpeg" : fileExtension
				}`
			});

			embed = {
				$type: "app.bsky.embed.images",
				images: [
					{
						alt: `Image for ${event.title}`,
						image: uploadResult.data.blob
					}
				]
			};
		} catch (error) {
			console.error("Failed to convert remote image to embed:", error);
		}
	}

	if (!embed) {
		try {
			const mascots = ["natty", "oriole", "raven", "utz"];
			const randomMascot =
				mascots[Math.floor(Math.random() * mascots.length)];
			const url = path.join(__dirname, "mascots", `${randomMascot}.png`);
			const buffer = await fs.promises.readFile(url);
			const uInt8Array = new Uint8Array(buffer);
			const uploadResult = await agent.uploadBlob(uInt8Array, {
				encoding: "image/png"
			});

			embed = {
				$type: "app.bsky.embed.images",
				images: [
					{
						alt: `Image for ${event.title}`,
						image: uploadResult.data.blob
					}
				]
			};
		} catch (error) {
			console.error("Failed to convert local image to embed:", error);
		}
	}

	return embed;
};

const getRandomEvent = async () => {
	try {
		const response = await fetch(
			"https://bmoretoday.modamo.xyz/api/events"
		);

		if (!response.ok) {
			throw new Error(`API request failed: ${response.status}`);
		}

		const events: Event[] = await response.json();
		const numberOfEvents = events.length;

		if (numberOfEvents === 0) {
			console.error("No events found in API response");

			return null;
		}

		const event = events[Math.floor(Math.random() * numberOfEvents)];

		return event;
	} catch (error) {
		console.error("Failed to fetch events:", error);

		return null;
	}
};

const loginToBluesky = async () => {
	const agent = new AtpAgent({
		service: "https://bsky.social"
	});

	try {
		await agent.login({
			identifier: "bmoretoday.modamo.xyz",
			password: process.env.BLUESKY_PASSWORD!
		});

		return agent;
	} catch (error) {
		console.error("Failed to log in:", error);

		return null;
	}
};

const skeetRandomEvent = async () => {
	const agent = await loginToBluesky();

	if (!agent) {
		return;
	}

	const event = await getRandomEvent();

	if (!event) {
		return;
	}

	const getDisplayedPrice = () => {
		let price = "";

		if (event.minprice) {
			price += `$${event.minprice}`;
		}

		if (event.maxprice && event.maxprice !== event.minprice) {
			price += ` to $${event.maxprice}`;
		}

		return price || event.pricedescription || event.price;
	};

	const getDisplayedTime = () => {
		const startTime = event.starttime
			? DateTime.fromFormat(event.starttime.toString(), "HH:mm:ss")
			: null;
		const endTime = event.endtime
			? DateTime.fromFormat(event.endtime.toString(), "HH:mm:ss")
			: null;

		return `${startTime ? startTime.toFormat("hh:mm a") : "Not Provided"}${
			endTime ? ` to ${endTime.toFormat("hh:mm a")}` : ""
		}`;
	};

	const url = "https://bmoretoday.modamo.xyz/";
	const text = `Today's random #Baltimore event:

🎟️ : ${event.title}
📍 : ${event.location}
💰 : ${getDisplayedPrice()}
⏰ : ${getDisplayedTime()}
	
Check out more at ${url}`;
	const textBytes = new TextEncoder().encode(text);
	const urlBytes = new TextEncoder().encode(url);
	const textString = new TextDecoder().decode(textBytes);
	const characterStart = textString.indexOf(url);
	const beforeURL = textString.substring(0, characterStart);
	const linkStart = new TextEncoder().encode(beforeURL).length;
	const linkEnd = linkStart + urlBytes.length;

	const embed = await getImageEmbed(agent, event);

	await agent.post({
		createdAt: new Date().toISOString(),
		embed,
		facets: [
			{
				index: { byteEnd: linkEnd, byteStart: linkStart },
				features: [{ $type: "app.bsky.richtext.facet#link", uri: url }]
			}
		],
		text
	});
};

skeetRandomEvent();
