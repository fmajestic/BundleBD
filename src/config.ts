import fs from "fs";
import path from "path";
import webpack, { ProgressPlugin, ProvidePlugin } from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import { parseString, argv, ensureDirExists } from "./utils";
import Logger from "./logger";

interface bundleConfiguration {
	entry: string;
	output: string;
	filename: string;
	bdPath?: string;
	readme?: boolean | string;
}

interface pluginConfiguration {
	meta: {
		name: string;
		author: string;
		description: string;
		version: string;
		invite?: string;
		authorId?: string;
		authorLink?: string;
		donate?: string;
		patreon?: string;
		website?: string;
		source?: string;
	};
	changelog?: Array<{
		title: string;
		type?: string;
		items: string[];
	}>;
	entry?: string;
	zlibrary?: boolean;
}

function getBundleConfig(): bundleConfiguration {
	const configPath = path.join(process.cwd(), "bundlebd.config.json");
	const defaultConfig = { entry: "src", output: "dist", filename: "[plugin].plugin.js" };
	return Object.assign(
		defaultConfig,
		fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {}
	);
}

function getPluginConfig(entry: string): pluginConfiguration {
	const defaultMeta = {
		name: argv.plugin,
		author: "Unknown",
		description: "Plugin bundled with BundleBD",
		version: "1.0.0"
	};

	const acceptedMetaKeys = [
		"name",
		"author",
		"description",
		"version",
		"invite",
		"authorId",
		"authorLink",
		"donate",
		"patreon",
		"website",
		"source",
		"updateUrl"
	];

	const configPath = path.join(entry, "config.json");
	if (fs.existsSync(configPath)) {
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		const meta = Object.assign(defaultMeta, config.meta);
		for (const key in meta) {
			if (!acceptedMetaKeys.includes(key)) {
				Logger.warn(`Invalid meta key '${key}' in config.json`);
				delete meta[key];
			}
		}
		if (config.changelog && !config.zlibrary) {
			Logger.warn("Changelogs are currently only supported for plugins using ZLibrary");
		}
		return { ...config, meta };
	} else return { meta: defaultMeta };
}

export default function getConfigs(): [webpack.Configuration, pluginConfiguration, bundleConfiguration] {
	const parseOptions = { plugin: argv.plugin };
	const bundleConfig = getBundleConfig();

	const entryDir = path.join(process.cwd(), parseString(bundleConfig.entry, parseOptions));
	ensureDirExists(entryDir, `Cannot find entry directory '${entryDir}'`);

	const pluginConfig = getPluginConfig(entryDir);

	const styleLoader = path.resolve(__dirname, "loaders/style.js");
	const esbuildLoader = (loader: string) => ({
		loader: "esbuild-loader",
		options: {
			loader: loader,
			target: "es2018"
		}
	});
	const svgLoader = {
		loader: "@svgr/webpack",
		options: {
			jsxRuntime: "automatic",
			babel: false
		}
	};
	const styleRules = (regex: RegExp, preLoaders?: string[]) => [
		{
			test: regex,
			resourceQuery: { not: [/module/] },
			use: [
				styleLoader,
				{
					loader: "css-loader",
					options: {
						modules: {
							auto: new RegExp(`\\.module${regex.source}`),
							localIdentName: pluginConfig.meta.name + "-[name]-[local]"
						},
						importLoaders: preLoaders?.length || 0
					}
				},
				...(preLoaders || [])
			]
		},
		{
			test: regex,
			resourceQuery: /module/,
			use: [
				styleLoader,
				{
					loader: "css-loader",
					options: {
						modules: {
							localIdentName: pluginConfig.meta.name + "-[name]-[local]"
						},
						importLoaders: preLoaders?.length || 0
					}
				},
				...(preLoaders || [])
			]
		}
	];

	const webpackConfig: webpack.Configuration = {
		mode: "production",
		watch: argv.development,
		target: "node",
		entry: pluginConfig.entry ? path.join(entryDir, pluginConfig.entry) : entryDir,
		output: {
			filename: parseString(bundleConfig.filename, parseOptions),
			path: path.join(process.cwd(), parseString(bundleConfig.output, parseOptions)),
			library: pluginConfig.zlibrary
				? {
						type: "assign",
						name: "Plugin"
				  }
				: {
						type: "commonjs2",
						export: "default"
				  }
		},
		resolve: {
			extensions: [".js", ".jsx", ".ts", ".tsx"]
		},
		module: {
			rules: [
				{
					test: /\.jsx?$/,
					use: esbuildLoader("jsx")
				},
				{
					test: /\.tsx?$/,
					use: esbuildLoader("tsx")
				},
				...styleRules(/\.css$/),
				...styleRules(/\.s[ac]ss$/, ["sass-loader"]),
				{
					test: /\.txt$/,
					type: "asset/source"
				},
				{
					test: /\.svg$/,
					issuer: /\.[jt]sx?$/,
					resourceQuery: { not: [/url/] },
					use: [esbuildLoader("jsx"), svgLoader]
				},
				{
					test: /\.svg$/,
					issuer: /\.[jt]sx?$/,
					resourceQuery: /url/,
					type: "asset/inline"
				},
				{
					test: /\.svg$/,
					issuer: { not: /\.[jt]sx?$/ },
					type: "asset/inline"
				},
				{
					test: /\.png$|\.jpe?g$/,
					type: "asset/inline"
				}
			]
		},
		externals: {
			react: "var BdApi.React",
			"react-dom": "var BdApi.ReactDOM",
			"@zlibrary": "var Library",
			"@zlibrary/plugin": "var BasePlugin"
		},
		plugins: [
			new ProvidePlugin({
				React: "react"
			}),
			new ProgressPlugin()
		],
		optimization: {
			minimizer: [
				new TerserPlugin({
					terserOptions: {
						compress: { defaults: false },
						format: { comments: false },
						mangle: false
					}
				})
			]
		}
	};

	return [webpackConfig, pluginConfig, bundleConfig];
}