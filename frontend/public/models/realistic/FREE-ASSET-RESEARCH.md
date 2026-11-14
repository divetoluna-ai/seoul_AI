# Free breed assets — 2026-11-14

## Installed

- Maltese: erik_sk, `fcb869fb1464475c86933cf471502a54`, CC BY 4.0. Downloaded from the public AllenAI Objaverse mirror without login. Pink material changed to white. Custom skinning and eight motion clips generated in `avatar-quadruped-rig.ts`.
- Golden Retriever: a955087 / Mm Project, `412544b36a81481c879b0420c513da6c`, CC BY 4.0. Downloaded from the same public mirror without login. Custom skinning and eight motion clips.

Both have bundled original metadata and license/credit files. These are automated rigs, with limitations in deformation quality and clothing collision.

## Other candidates

The following table records earlier research candidates; these exact candidate files are **not installed**. Do not add a breed to the selector until its downloaded file, license, anatomy, texture quality and deformation have been checked. Do not rename an existing breed or use a static translation as a walking animation.

| Breed | Candidate | Verified from public page | Still required |
| --- | --- | --- | --- |
| Pomeranian | https://www.meshy.ai/tags/pomeranian | Community gallery advertises CC0; example Golden Fluff post reports `modelIsAnimated: false` | Obtain a genuinely free downloadable file; inspect appearance; rig and animate |
| Poodle | https://sketchfab.com/3d-models/poodle-a06bd9c6751a4eea9287b94ab776ad3f | Daniel Peng; CC Attribution; 466.4k triangles | Obtained from Objaverse without login, but rejected: the original blue hoodie and other clothing are part of the model. Other candidates are low-poly figures or sculptures. |
| Maltese | https://open3dmodel.com/3d-models/maltese | Search category advertises a free result | Establish actual animal model, origin and redistribution license before downloading |
| Golden Retriever | https://sketchfab.com/3d-models/simple-pre-rigged-golden-retriever-c145f814acca44c7b43636c316e7c08c | FigDaFloof; CC Attribution; described as pre-rigged; 16.4k triangles | Download API returned `Authentication credentials were not provided.`; inspect realism, skin weights and clips |
| Russian Blue | https://www.meshy.ai/subcategory/cats | Gallery lists Russian Blue models | Identify individual realistic model and free download eligibility; inspect file, rig and clips |
| Ragdoll | https://sketchfab.com/3d-models/ragdoll-cat-18b2b9078ced4c0792ac69a913cb3274 | Meibeyou; advertised as free download | Access detail/download and confirm exact license, realism and rig; animate |

Meshy's gallery marketing does not establish that every textured model is downloadable on the Free plan. Its current help article explicitly limits Free downloads; no paid credits, subscriptions or assets have been used:
https://help.meshy.ai/en/articles/10421033-why-can-t-i-download-my-model

## Integration contract

`RealModel.motion` enables animation only for an imported skinned model with all eight named clips: `idle`, `walk`, `sitDown`, `sitIdle`, `standUp`, `lieDown`, `lieIdle`, `getUp`. Map names explicitly; do not infer them from filenames. Walking must be in place, face normalized +Z, and its speed must be calibrated to the stride after normalization. Preview each transition and each of the ten garments before enabling a model.

The loader preserves the imported skeleton, clones it for each instance, transfers garment weights from the nearest body triangle, and drives the same skeleton with AnimationMixer. Navigation accounts for the model footprint and furniture. The two installed meshes are also tested for finite deformation, normalized weights, and eight clips. The remaining four breeds are still unavailable. Skin transfer is not cloth simulation and cannot alone guarantee collision-free fabric in every pose.

Objaverse research covered all 160 metadata shards (798,759 objects indexed), with name/description/tag matches inspected. Similar names included unrelated objects; these were not accepted as breeds. Meshy public previews use a protected proprietary container, not an anonymous GLB download, and no protection was bypassed. Thingiverse returned an access challenge. Research metadata and rejected downloads remain outside the repository.
