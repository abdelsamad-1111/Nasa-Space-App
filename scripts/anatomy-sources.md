# Anatomy model sources

`public/models/anatomy.glb` contains original anatomical mesh surfaces from **BodyParts3D / DBCLS**.

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- [Database and current license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) (updated 2025-02-27).
- [Version 4 archive](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/): download `isa_BP3D_4.0_obj_99.zip`, `isa_element_parts.txt`, and `partof_element_parts.txt`. Save the mesh archive as `isa_obj.zip` in the source directory.
- [Version 3 archive](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip): supplies the complete five lung lobe surfaces. The v4 lung compound mappings include bronchial and vascular structures and did not supply the complete external lobe surfaces used here.

The downloaded source OBJ files retain older notices. Those notices are recorded here and in the generated GLB metadata; the current database license page is linked separately above.

The v3 lung OBJ header reads:

```text
# Wavafront OBJ file of BodyParts3D
# BodyParts3D, Copyright(C) 2010-2011 The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan.
```

The v4 OBJ header identifies the same database and carries this attribution:

```text
BodyParts3D, (c)  The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan
```

The original v3 archive documentation is available at [README_e.html](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html).

The selected files are declared in `anatomy-groups.json`. The three right-lung lobes are `FMA7333`, `FMA7337`, and `FMA7383`; the two left-lung lobes are `FMA7370` and `FMA7371`. The trachea and main bronchi remain separate from the lobe surfaces. Liver tissue segments are selected explicitly to exclude the vessels mixed into its compound mapping.

Both releases use the source millimetre coordinate frame. The build applies the existing body-wide conversion to metres and Y-up; it does not invent, inflate, relocate, or rescale the lung surfaces. The body, brain, heart, legs, and chest dosimeter retain their positions. Organ surfaces use smooth geometric shading. Only the body frame retains a flat outline, which the interactive view hides when rotating.

To rebuild with Python 3 and the project's installed Node dependencies:

```text
python -I scripts/extract-bp3d.py <v4-source-dir> <extracted-dir> --lung-archive <BodyParts3D_3.0_obj_99.zip>
node --max-old-space-size=4096 scripts/build-anatomy.mjs <extracted-dir>
```

Extraction requires every requested source surface and verifies its ZIP CRC. The build validates input geometry, retains separate materials for health status updates, simplifies large meshes, generates smooth normals, compresses with Draco, and writes the GLB plus hotspot coordinates. Source and attribution metadata are also embedded in the GLB.

Reference: Mitsuhashi et al., *BodyParts3D: 3D structure database for anatomical concepts*, Nucleic Acids Research (2009), [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613).
