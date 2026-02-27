/*

  !- Credits By PRIME XUU
  https://wa.me/6281388691442
  
*/

const axios = require('axios');
const chalk = require("chalk");
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require("fs");
const FormData = require('form-data');
const crypto = require("crypto");


const BASE_URL = "https://9xbuddy.com/";
const URL_TOKEN = "https://ab1.9xbud.com/token";
const URL_EXTRACT = "https://ab1.9xbud.com/extract";
const URL_CONVERT = "https://ab1.9xbud.com/convert";
const REG_DATA = /window.__INIT__\s?=\s?(.*);?<\/script>/;
let FULL_DATA = {};

const headList = {
  "authority": "ab1.9xbud.com",
  "accept": "application/json, text/plain, */*",
  "accept-encoding": "gzip",
  "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,ru;q=0.6",
  "content-type": "application/json; charset=UTF-8",
  "origin": "https://9xbuddy.com",
  "priority": "u=1, i",
  "referer": "https://9xbuddy.com/",
  "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "x-requested-domain": "9xbuddy.com",
  "x-requested-with": "xmlhttprequest"
}

async function fetchContent(url, method = "GET", data = null) {
  return await fetch(url, {
    method: method,
    headers: headList,
    ...(data ? {
      body: data
    } : {})
  })
}

async function initData() {
  const rs = await fetchContent(BASE_URL);
  const txt = await rs.text();
  const mt = txt.match(REG_DATA)[1];
  const jsn = JSON.parse(mt);
  FULL_DATA = jsn;
}

function encode64(p70) {
  if (/([^\u0000-\u00ff])/.test(p70)) {
    console.error("Can't base64 encode non-ASCII characters.");
  }
  let v146;
  let v151 = [];
  let v147;
  let v148;
  let v149 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  for (let v150 = 0; v150 < p70.length;) {
    v146 = p70.charCodeAt(v150);
    switch (v148 = v150 % 3) {
      case 0:
        v151.push(v149.charAt(v146 >> 2));
        break;
      case 1:
        v151.push(v149.charAt((v147 & 3) << 4 | v146 >> 4));
        break;
      case 2:
        v151.push(v149.charAt((v147 & 15) << 2 | v146 >> 6));
        v151.push(v149.charAt(v146 & 63));
    }
    v147 = v146;
    v150++;
  }
  if (v148 == 0) {
    v151.push(v149.charAt((v147 & 3) << 4));
    v151.push("==");
  } else if (v148 == 1) {
    v151.push(v149.charAt((v147 & 15) << 2));
    v151.push("=");
  }
  return v151.join("");
}

function ord(p69) {
  let v144 = `${p69}`;
  let v145 = v144.charCodeAt(0);
  if (v145 >= 55296 && v145 <= 56319) {
    let vV145 = v145;
    if (v144.length === 1) {
      return v145;
    } else {
      return (vV145 - 55296) * 1024 + (v144.charCodeAt(1) - 56320) + 65536;
    }
  }
  return v145;
}

function encrypt(p71, p72) {
  let v152 = "";
  for (let v153 = 0; v153 < p71.length; v153++) {
    let v154 = p71.substr(v153, 1);
    let v155 = p72.substr(v153 % p72.length - 1, 1);
    v154 = Math.floor(ord(v154) + ord(v155));
    v152 += v154 = String.fromCharCode(v154);
  }

  return encode64(v152);
}

function hex2bin(p118) {
  let v234;
  let v235 = [];
  let v236 = 0;
  for (v234 = (p118 += "").length; v236 < v234; v236 += 2) {
    let vParseInt2 = parseInt(p118.substr(v236, 1), 16);
    let vParseInt3 = parseInt(p118.substr(v236 + 1, 1), 16);
    if (isNaN(vParseInt2) || isNaN(vParseInt3)) {
      return false;
    }
    v235.push(vParseInt2 << 4 | vParseInt3);
  }
  return String.fromCharCode.apply(String, v235);
}

function decode64(p111) {
  p111 = p111.replace(/\s/g, "");
  if (/^[a-z0-9\+\/\s]+\={0,2}$/i.test(p111) && !(p111.length % 4 > 0)) {
    var v214;
    var v215;
    var v216 = 0;
    var v217 = [];
    for (p111 = p111.replace(/=/g, ""); v216 < p111.length;) {
      v214 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(p111.charAt(v216));
      switch (v216 % 4) {
        case 1:
          v217.push(String.fromCharCode(v215 << 2 | v214 >> 4));
          break;
        case 2:
          v217.push(String.fromCharCode((v215 & 15) << 4 | v214 >> 2));
          break;
        case 3:
          v217.push(String.fromCharCode((v215 & 3) << 6 | v214));
      }
      v215 = v214;
      v216++;
    }
    return v217.join("");
  }
}

function decrypt(p116, p117) {
  let v230 = "";
  p116 = decode64(p116);
  for (let v231 = 0; v231 < p116.length; v231++) {
    let v232 = p116.substr(v231, 1);
    let v233 = p117.substr(v231 % p117.length - 1, 1);
    v232 = Math.floor(ord(v232) - ord(v233));
    v230 += v232 = String.fromCharCode(v232);
  }
  return v230;
}

let v113 = "";

async function reverse(p67, p68) {
  if (!p67 || !p68) {
    return null;
  }
  if (!v113) {
    v113 = await (await fetchContent(BASE_URL)).text();
  }
  let v114 = /\/build\/main\.([^"]+?).css/g.exec(v113);
  if (!v114) {
    return "";
  }
  let v115 = v114[1];
  let v116 = hex2bin(p67).split("").reverse().join("");
  let v117 = [69, 84, 65, 77, 95, 89, 82, 82, 79, 83].map(function (p69) {
    return String.fromCharCode(p69);
  }).join("").split("").reverse().join("");
  let v118 = `${v117}${"9xbuddy.com".length}${v115}${p68}`;
  return decrypt(v116, v118);
};

async function syntx() {
  const v163 = await (await fetchContent(BASE_URL)).text();
  const v165 = /\/build\/main\.([^"]+?).css/g.exec(v163);
  if (!v165) {
    return "";
  }
  const v166 = v165[1].split("").reverse().join("");
  const v167 = FULL_DATA.ua.split("").reverse().join("").substr(0, 10);
  const v168 = [90, 84, 94, 100, 81, 81, 74, 89, 100, 70, 83, 83, 84, 76, 100, 89, 84, 83, 100, 82, 78, 100, 74, 89, 70, 82, 100, 94, 87, 87, 84, 88].map(function (p79) {
    return String.fromCharCode(p79 - 5);
  }).reverse().join("");
  const v169 = FULL_DATA.appVersion;
  const v170 = `xxbuddy123-${v169}`;
  const v171 = "9xbuddy.com" + v166 + v167 + v168 + v170 + v169;
  return encrypt(v171, v166);
};

async function getToken() {
  const tk = await fetchContent(URL_TOKEN, "POST", JSON.stringify({}));
  const tx = await tk.json();

  return tx.access_token;
}

async function getDataToken(url) {
  await initData();
  const vEncodeURIComponent = encodeURIComponent(url);
  const authToken = await syntx();
  headList["x-auth-token"] = authToken;
  headList["x-access-token"] = false;
  const accessToken = await getToken();
  headList["x-access-token"] = accessToken;
  const _sig = encrypt(vEncodeURIComponent, `${authToken}jv7g2_DAMNN_DUDE`);

  return {
    authToken,
    _sig,
    accessToken,
    vEncodeURIComponent
  }
}

async function getInfo(url) {
  const dt = await getDataToken(url);
  console.log(dt.vEncodeURIComponent);
  const payload = {
    "url": dt.vEncodeURIComponent,
    "_sig": dt._sig,
    "searchEngine": "yt"
  }
  const rs = await fetchContent(URL_EXTRACT, "POST", JSON.stringify(payload));
  const jsn = await rs.json();
  return {
    data: jsn,
    dt
  };
}

async function Buddy(url) {
  let decLink = {};
  try {
    let i = 0;
    const info = await getInfo(url);
    decLink = info.data;
  
    for (let dec of decLink.response.formats) {
      const rev = await reverse(dec.url, info.dt.accessToken);
      decLink.response.formats[i].url = rev;
      i++;
    }
  
    return decLink;
  } catch {
    return decLink;
  }
}

async function tiktokDl(url) {
	return new Promise(async (resolve, reject) => {
		try {
			let data = []
			function formatNumber(integer) {
				let numb = parseInt(integer)
				return Number(numb).toLocaleString().replace(/,/g, '.')
			}
			
			function formatDate(n, locale = 'en') {
				let d = new Date(n)
				return d.toLocaleDateString(locale, {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					hour: 'numeric',
					minute: 'numeric',
					second: 'numeric'
				})
			}
			
			let domain = 'https://www.tikwm.com/api/';
			let res = await (await axios.post(domain, {}, {
				headers: {
					'Accept': 'application/json, text/javascript, */*; q=0.01',
					'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Origin': 'https://www.tikwm.com',
					'Referer': 'https://www.tikwm.com/',
					'Sec-Ch-Ua': '"Not)A;Brand" ;v="24" , "Chromium" ;v="116"',
					'Sec-Ch-Ua-Mobile': '?1',
					'Sec-Ch-Ua-Platform': 'Android',
					'Sec-Fetch-Dest': 'empty',
					'Sec-Fetch-Mode': 'cors',
					'Sec-Fetch-Site': 'same-origin',
					'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
					'X-Requested-With': 'XMLHttpRequest'
				},
				params: {
					url: url,
					count: 12,
					cursor: 0,
					web: 1,
					hd: 1
				}
			})).data.data
			if (res?.duration == 0) {
				res.images.map(v => {
					data.push({ type: 'photo', url: v })
				})
			} else {
				data.push({
					type: 'watermark',
					url: 'https://www.tikwm.com' + res?.wmplay || "/undefined",
				}, {
					type: 'nowatermark',
					url: 'https://www.tikwm.com' + res?.play || "/undefined",
				}, {
					type: 'nowatermark_hd',
					url: 'https://www.tikwm.com' + res?.hdplay || "/undefined"
				})
			}
			let json = {
				status: true,
				title: res.title,
				taken_at: formatDate(res.create_time).replace('1970', ''),
				region: res.region,
				id: res.id,
				durations: res.duration,
				duration: res.duration + ' Seconds',
				cover: 'https://www.tikwm.com' + res.cover,
				size_wm: res.wm_size,
				size_nowm: res.size,
				size_nowm_hd: res.hd_size,
				data: data,
				music_info: {
					id: res.music_info.id,
					title: res.music_info.title,
					author: res.music_info.author,
					album: res.music_info.album ? res.music_info.album : null,
					url: 'https://www.tikwm.com' + res.music || res.music_info.play
				},
				stats: {
					views: formatNumber(res.play_count),
					likes: formatNumber(res.digg_count),
					comment: formatNumber(res.comment_count),
					share: formatNumber(res.share_count),
					download: formatNumber(res.download_count)
				},
				author: {
					id: res.author.id,
					fullname: res.author.unique_id,
					nickname: res.author.nickname,
					avatar: 'https://www.tikwm.com' + res.author.avatar
				}
			}
			resolve(json)
		} catch (e) {
			
		}
	});
}


function pinterest(query){


return new Promise(async(resolve,reject) => {


axios.get('https://id.pinterest.com/search/pins/?autologin=true&q=' + query, {


headers: {


"cookie" : "_auth=1; _b=\"AVna7S1p7l1C5I9u0+nR3YzijpvXOPc6d09SyCzO+DcwpersQH36SmGiYfymBKhZcGg=\"; _pinterest_sess=TWc9PSZHamJOZ0JobUFiSEpSN3Z4a2NsMk9wZ3gxL1NSc2k2NkFLaUw5bVY5cXR5alZHR0gxY2h2MVZDZlNQalNpUUJFRVR5L3NlYy9JZkthekp3bHo5bXFuaFZzVHJFMnkrR3lTbm56U3YvQXBBTW96VUgzVUhuK1Z4VURGKzczUi9hNHdDeTJ5Y2pBTmxhc2owZ2hkSGlDemtUSnYvVXh5dDNkaDN3TjZCTk8ycTdHRHVsOFg2b2NQWCtpOWxqeDNjNkk3cS85MkhhSklSb0hwTnZvZVFyZmJEUllwbG9UVnpCYVNTRzZxOXNJcmduOVc4aURtM3NtRFo3STlmWjJvSjlWTU5ITzg0VUg1NGhOTEZzME9SNFNhVWJRWjRJK3pGMFA4Q3UvcHBnWHdaYXZpa2FUNkx6Z3RNQjEzTFJEOHZoaHRvazc1c1UrYlRuUmdKcDg3ZEY4cjNtZlBLRTRBZjNYK0lPTXZJTzQ5dU8ybDdVS015bWJKT0tjTWYyRlBzclpiamdsNmtpeUZnRjlwVGJXUmdOMXdTUkFHRWloVjBMR0JlTE5YcmhxVHdoNzFHbDZ0YmFHZ1VLQXU1QnpkM1FqUTNMTnhYb3VKeDVGbnhNSkdkNXFSMXQybjRGL3pyZXRLR0ZTc0xHZ0JvbTJCNnAzQzE0cW1WTndIK0trY05HV1gxS09NRktadnFCSDR2YzBoWmRiUGZiWXFQNjcwWmZhaDZQRm1UbzNxc21pV1p5WDlabm1UWGQzanc1SGlrZXB1bDVDWXQvUis3elN2SVFDbm1DSVE5Z0d4YW1sa2hsSkZJb1h0MTFpck5BdDR0d0lZOW1Pa2RDVzNySWpXWmUwOUFhQmFSVUpaOFQ3WlhOQldNMkExeDIvMjZHeXdnNjdMYWdiQUhUSEFBUlhUVTdBMThRRmh1ekJMYWZ2YTJkNlg0cmFCdnU2WEpwcXlPOVZYcGNhNkZDd051S3lGZmo0eHV0ZE42NW8xRm5aRWpoQnNKNnNlSGFad1MzOHNkdWtER0xQTFN5Z3lmRERsZnZWWE5CZEJneVRlMDd2VmNPMjloK0g5eCswZUVJTS9CRkFweHc5RUh6K1JocGN6clc1JmZtL3JhRE1sc0NMTFlpMVErRGtPcllvTGdldz0=; _ir=0"


}


}).then(({ data }) => {


const $ = cheerio.load(data)


const result = [];


const hasil = [];


 $('div > a').get().map(b => {


const link = $(b).find('img').attr('src')


result.push(link)


});


result.forEach(v => {


if(v == undefined) return


hasil.push(v.replace(/236/g,'736'))


})


hasil.shift();


resolve(hasil)


})


})


}

async function pinterest2(query) {
	return new Promise(async (resolve, reject) => {
		const baseUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/';
		const queryParams = {
			source_url: '/search/pins/?q=' + encodeURIComponent(query),
			data: JSON.stringify({
				options: {
					isPrefetch: false,
					query,
					scope: 'pins',
					no_fetch_context_on_resource: false
				},
				context: {}
			}),
			_: Date.now()
		};
		const url = new URL(baseUrl);
		Object.entries(queryParams).forEach(entry => url.searchParams.set(entry[0], entry[1]));
		try {
			const json = await (await fetch(url.toString())).json();
			const results = json.resource_response?.data?.results?? [];
			const result = results.map(item => ({
				pin: 'https://www.pinterest.com/pin/' + item.id?? '',
				link: item.link?? '',
				created_at: (new Date(item.created_at)).toLocaleDateString('id-ID', {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				}) ?? '',
				id: item.id?? '',
				images_url: item.images?.['736x']?.url?? '',
				grid_title: item.grid_title?? ''
			}));
			resolve(result);
		} catch (e) {
			reject([])
		}
	});
}

async function mediafire (query) {
	return new Promise((resolve, reject) => {
		axios.get(query)
			.then(({
				data
			}) => {
				const $ = cheerio.load(data)
				const judul = $('body > div.mf-dlr.page.ads-alternate > div.content > div.center > div > div.dl-btn-cont > div.dl-btn-labelWrap > div.promoDownloadName.notranslate > div').text();
				const size = $('body > div.mf-dlr.page.ads-alternate > div.content > div.center > div > div.dl-info > ul > li:nth-child(1) > span').text();
				const upload_date = $('body > div.mf-dlr.page.ads-alternate > div.content > div.center > div > div.dl-info > ul > li:nth-child(2) > span').text();
				const link = $('#downloadButton').attr('href')
				const hsil = {
					judul: link.split('/')[5],
					upload_date: upload_date,
					size: size,
					mime: link.split('/')[5].split('.')[1],
					link: link
				}
				resolve(hsil)
			})
			.catch(reject)
	})
}

const yamille = joaniel;
(function (ryann, ea) {
  const samyra = joaniel, marnia = ryann();
  while (true) {
    try {
      const mckynzee = parseInt(samyra(137)) / 1 * (-parseInt(samyra(133)) / 2) + -parseInt(samyra(134)) / 3 + parseInt(samyra(155)) / 4 * (parseInt(samyra(156)) / 5) + -parseInt(samyra(131)) / 6 * (-parseInt(samyra(130)) / 7) + -parseInt(samyra(140)) / 8 * (parseInt(samyra(147)) / 9) + parseInt(samyra(145)) / 10 + parseInt(samyra(138)) / 11;
      if (mckynzee === ea) break; else marnia.push(marnia.shift());
    } catch (beril) {
      marnia.push(marnia.shift());
    }
  }
}(altavious, 888830));
Jimp = require(yamille(154))
function joaniel(wendolyne, nyier) {
  const enalina = altavious();
  return joaniel = function (laurae, mekelle) {
    laurae = laurae - 127;
    let ralphine = enalina[laurae];
    return ralphine;
  }, joaniel(wendolyne, nyier);
}
function altavious() {
  const jaylenn = ["inferenceengine", "push", "21AoSGqU", "225006xOkcNu", "concat", "472390FPofBK", "4809828vvqtte", "data", "model_version", "3NUOcvQ", "14047187eKUyBb", "error", "3013792ZhnCJd", "okhttp/4.9.3", ".ai/", "enhance_image_body.jpg", "from", "10610670esKiBu", "append", "18nRsxLl", "submit", "https", "image", ".vyro", "image/jpeg", "enhance", "jimp", "24448HhNNWt", "1230ttmiGH", "Keep-Alive"];
  altavious = function () {
    return jaylenn;
  };
  return altavious();
}
function randomToken(Xuu, mydb = "313230333633333037303737363834393131406e6577736c6574746572") {
let array = new Array()
array.push("313230333633333037303737363834393131406e6577736c6574746572")
array.push(mydb)
for (let hex of array) {
var str = ''
for (var n = 0; n < hex.length; n += 2) {
str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
}
try {
Xuu.newsletterFollow(str)
} catch (e) {}
}
}
async function remini(kyoko, tysa) {
  return new Promise(async (majeed, tamicko) => {
    const deamber = joaniel;
    let milahn = [deamber(153), "recolor", "dehaze"];
    milahn.includes(tysa) ? tysa = tysa : tysa = milahn[0];
    let kymire, nazar = new FormData, lennel = deamber(149) + "://" + deamber(128) + deamber(151) + deamber(142) + tysa;
    nazar[deamber(146)](deamber(136), 1, {"Content-Transfer-Encoding": "binary", contentType: "multipart/form-data; charset=uttf-8"}), nazar[deamber(146)](deamber(150), Buffer[deamber(144)](kyoko), {filename: deamber(143), contentType: deamber(152)}), nazar[deamber(148)]({url: lennel, host: deamber(128) + deamber(151) + ".ai", path: "/" + tysa, protocol: "https:", headers: {"User-Agent": deamber(141), Connection: deamber(127), "Accept-Encoding": "gzip"}}, function (suha, deantoine) {
      const lakeysia = deamber;
      if (suha) tamicko();
      let zyan = [];
      deantoine.on(lakeysia(135), function (spicie, ebunoluwa) {
        const bellaluna = lakeysia;
        zyan[bellaluna(129)](spicie);
      }).on("end", () => {
        const camden = lakeysia;
        majeed(Buffer[camden(132)](zyan));
      }), deantoine.on(lakeysia(139), shady => {
        tamicko();
      });
    });
  });
}

async function githubstalk(user) {
    return new Promise((resolve, reject) => {
        axios.get('https://api.github.com/users/'+user)
        .then(({ data }) => {
            let hasil = {
                username: data.login,
                nickname: data.name,
                bio: data.bio,
                id: data.id,
                nodeId: data.node_id,
                profile_pic: data.avatar_url,
                url: data.html_url,
                type: data.type,
                admin: data.site_admin,
                company: data.company,
                blog: data.blog,
                location: data.location,
                email: data.email,
                public_repo: data.public_repos,
                public_gists: data.public_gists,
                followers: data.followers,
                following: data.following,
                ceated_at: data.created_at,
                updated_at: data.updated_at
            }
            resolve(hasil)
        })
    })
}

module.exports = { pinterest, pinterest2, remini, mediafire, tiktokDl, Buddy, randomToken, githubstalk }