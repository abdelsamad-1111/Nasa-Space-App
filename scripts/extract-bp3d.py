"""Extract the anatomical surfaces declared in anatomy-groups.json.

Usage: python -I scripts/extract-bp3d.py <bp3d_dir> <out_dir>
         --lung-archive <BodyParts3D_3.0_obj_99.zip>

The v4 directory contains isa_obj.zip, isa_element_parts.txt and
partof_element_parts.txt. The v3 archive supplies the five complete lung lobes;
v4 lung compound concepts also include vessels and bronchial trees.
See anatomy-sources.md for the official downloads and attribution.
"""
import argparse
import collections
from contextlib import ExitStack
import json
from pathlib import Path
import zipfile


def extract():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bp3d_dir', type=Path)
    parser.add_argument('out_dir', type=Path)
    parser.add_argument('--lung-archive', required=True, type=Path)
    args = parser.parse_args()
    groups = json.loads(Path(__file__).with_name('anatomy-groups.json').read_text(encoding='utf-8'))['groups']

    elements = collections.defaultdict(set)
    for list_name in ('isa_element_parts.txt', 'partof_element_parts.txt'):
        with (args.bp3d_dir / list_name).open(encoding='utf-8') as source:
            next(source)
            for line in source:
                fields = line.rstrip('\n').split('\t')
                if len(fields) >= 3:
                    elements[fields[0]].add(fields[2])

    with ExitStack() as stack:
        archives = {
            'v4': stack.enter_context(zipfile.ZipFile(args.bp3d_dir / 'isa_obj.zip')),
            'v3': stack.enter_context(zipfile.ZipFile(args.lung_archive)),
        }
        entries = {
            version: {Path(name).name: name for name in archive.namelist() if name.lower().endswith('.obj')}
            for version, archive in archives.items()
        }
        manifest = {}
        for group, spec in groups.items():
            version = spec.get('source', 'v4')
            ids = set(spec.get('elements', []))
            for concept in spec.get('concepts', []):
                if not elements[concept]:
                    raise ValueError(f'{group}: concept {concept} has no source elements')
                ids.update(elements[concept])
            missing = sorted(file_id for file_id in ids if file_id + '.obj' not in entries[version])
            if not ids or missing:
                raise ValueError(f'{group}: empty group or missing {version} surfaces: {missing}')

            destination = args.out_dir / group
            destination.mkdir(parents=True, exist_ok=True)
            for file_id in sorted(ids):
                # ZipFile.read also verifies the source file's CRC before it is used.
                data = archives[version].read(entries[version][file_id + '.obj'])
                (destination / (file_id + '.obj')).write_bytes(data)
            manifest[group] = {
                'material': spec['material'],
                'source': version,
                'elements': sorted(ids),
                'missing': [],
            }
            print(f'{group}: {len(ids)} verified {version} surfaces')

    temporary = args.out_dir / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    temporary.replace(args.out_dir / 'manifest.json')


if __name__ == '__main__':
    extract()
