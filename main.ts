import { App, FileSystemAdapter, Modal, Notice, Plugin } from 'obsidian';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
//@ts-ignore
import zipper from "zip-local";

export default class MyPlugin extends Plugin {
	async onload() {
		// This creates an icon in the left ribbon.
		this.addRibbonIcon('codepen', 'Permabrain', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new ArweaveModal(this.app).open();
		});
	}
}

class ArweaveModal extends Modal {
	constructor(app: App) {
		super(app);
	}
	// open a dialogue where user can select key file
	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Permabrain uploader" })
		contentEl.createEl("p", { text: "Before uploading your vault create an Arweave wallet and get some AR in it. Once that is done please select your key file below." })
		const bp = this.getVaultBasePath();
		
		contentEl.createEl("p", { text: "Note: This will upload an unencrypted zip file to Arweave.", cls: "note" })

		// open key file
		const input = contentEl.createEl('input', { type: 'file' });

		const div = contentEl.createEl('div');
		const btn = div.createEl("button", { text: "Upload", cls: "btn" });

		// the arweave key
		let k: JWKInterface;

		// init arweave
		const arweave = Arweave.init({
			host: 'arweave.net',
			port: 443,
			protocol: 'https'
		});

		btn.onclick = async () => {
			if (k == null) {
				return;
			}
			// checking key file
			const isOk = await this.verifyArweaveKey(arweave, k)

			// starting the process
			if (isOk) {
				this.createZip(arweave, k, bp)
			}
		}

		input.onchange = async () => {
			if (input.files != null) {
				// cast as JWKInterface
				const s = await input.files[0].text();
				k = JSON.parse(s) as JWKInterface;
			}
		}
	}

	async createZip(arweave: Arweave, k: JWKInterface, bp: string) {
		const data: Buffer = zipper.sync.zip(`${bp}`, null, true).compress().memory()
		this.uploadToArweave(arweave, k, data)
	}

	async verifyArweaveKey(arweave: Arweave, k: JWKInterface): Promise<boolean> {
		if (k.kty != 'RSA') {
			new Notice("You opened an invalid Arweave key");
			return false;
		}

		const addr = await arweave.wallets.jwkToAddress(k);
		const bal = await arweave.wallets.getBalance(addr);
		const b = parseFloat(arweave.ar.winstonToAr(bal));

		if (b <= 0) {
			new Notice("Your AR Balance is 0. Get some AR first.");
			return false;
		}
		new Notice(`Your AR balance is: ${b} AR`)
		return true;
	}

	async uploadToArweave(arweave: Arweave, k: JWKInterface, data: Uint8Array) {
		const tx = await arweave.createTransaction({ data: data }, k);
		tx.addTag('Content-Type', 'application/zip');
		tx.addTag('date', `${Date.toString}`);
		tx.addTag('type', 'brain-upload');

		await arweave.transactions.sign(tx, k);

		const uploader = await arweave.transactions.getUploader(tx);

		while (!uploader.isComplete) {
			try {
				await uploader.uploadChunk();
				new Notice(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
			} catch (e) {
				new Notice(`Error: ${e}`);
				break;
			}
		}

		new Notice(`transaction with ID ${tx.id} uploaded succesfully.`);
	}

	getVaultBasePath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return "";
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
