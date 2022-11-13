/* eslint-disable @typescript-eslint/no-var-requires */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { build, BuildOptions, Plugin } from "esbuild";
import prettier from "prettier";
import { dependencies } from "../package.json";

const externalPlugin: Plugin = {
	name: "external-plugin",
	setup(build) {
		const filter = /^[^./]|^\.[^./]|^\.\.[^/]/;
		build.onResolve({ filter }, (args) => ({ path: args.path, external: true }));
	}
};

const noCommentsPlugin: Plugin = {
	name: "no-comments-plugin",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) return;

			const content = fs.readFileSync("index.js", "utf8");
			fs.writeFileSync("index.js", content.replace(/\n?\/\/.*\n/g, ""));
		});
	}
};

const declarationPlugin: Plugin = {
	name: "declaration-plugin",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) return;
			execSync("tsc", { stdio: "inherit" });
		});
	}
};

const formatOptions: prettier.Options = {
	printWidth: 200,
	tabWidth: 4,
	useTabs: true,
	trailingComma: "none",
	endOfLine: "lf",
	parser: "babel"
};

type OptionalKeys<T> = { [K in keyof T]-?: Record<any, never> extends Pick<T, K> ? K : never }[keyof T];
type Require<T, R extends OptionalKeys<T>> = Omit<T, R> & Required<Pick<T, R>>;

const builds: { name: string; options: Require<BuildOptions, "outfile"> }[] = [
	{
		name: "bin",
		options: {
			entryPoints: ["src/bin/index.ts"],
			outfile: "bin.js",
			bundle: true,
			external: [...Object.keys(dependencies)],
			platform: "node",
			banner: { js: "#!/usr/bin/env node\n" }
		}
	},
	{
		name: "lib",
		options: {
			entryPoints: ["src/lib/index.ts"],
			outfile: "index.js",
			bundle: true,
			platform: "node",
			format: "esm",
			plugins: [externalPlugin, declarationPlugin, noCommentsPlugin]
		}
	}
];

const format = (file: string) => {
	const filePath = path.resolve(process.cwd(), file);
	const content = fs.readFileSync(filePath, "utf8");
	const formatted = prettier.format(content, formatOptions);
	fs.writeFileSync(filePath, formatted);
};

if (process.argv.slice(2)[0] === "watch") {
	for (const currBuild of builds) {
		const { name, options } = currBuild;
		options.watch = {
			onRebuild(error) {
				if (error) {
					console.log(`Failed to build ${name}`);
				} else {
					format(options.outfile);
					console.log(`Built ${name}`);
				}
			}
		};
	}
}

for (const currBuild of builds) {
	const { name, options } = currBuild;
	build(options)
		.then(() => {
			format(options.outfile);
			console.log(`Built ${name}`);
		})
		.catch(() => console.log(`Failed to build ${name}`));
}
