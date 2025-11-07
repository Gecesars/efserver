import click
from pathlib import Path
from flask import current_app
from flask.cli import with_appcontext
from app import db
from app.models import User, Role, File


@click.command('init-db')
@with_appcontext
def init_db_command():
    """Clear the existing data and create new tables."""
    db.drop_all()
    db.create_all()
    click.echo('Initialized the database.')


@click.command('create-admin')
@click.option('--username', prompt=True, help='Login do usuário administrador.')
@click.option(
    '--password',
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help='Senha do usuário administrador.'
)
@with_appcontext
def create_admin_command(username, password):
    """Create or update an administrator account."""
    Role.insert_roles()
    admin_role = Role.query.filter_by(name='Admin').first()
    if admin_role is None:
        click.echo('Admin role not found. Please run flask shell to inspect roles.')
        return

    user = User.query.filter_by(username=username).first()
    if user:
        click.echo(f'User "{username}" already exists. Updating password and role.')
    else:
        user = User(username=username)
        db.session.add(user)

    user.set_password(password)
    user.role = admin_role
    db.session.commit()
    click.echo(f'Admin user "{username}" is ready.')


def _sync_directory(path: Path, owner_id, parent_id=None):
    """Ensure DB entries mirror the filesystem tree."""
    created = 0
    if not path.exists():
        return created

    for entry in path.iterdir():
        if entry.is_dir():
            folder = File.query.filter_by(
                owner_id=owner_id,
                parent_id=parent_id,
                filename=entry.name,
                is_folder=True
            ).first()
            if folder is None:
                folder = File(
                    filename=entry.name,
                    owner_id=owner_id,
                    parent_id=parent_id,
                    is_folder=True
                )
                db.session.add(folder)
                db.session.commit()
                created += 1
            created += _sync_directory(entry, owner_id, folder.id)
        else:
            file_record = File.query.filter_by(
                owner_id=owner_id,
                parent_id=parent_id,
                filename=entry.name,
                is_folder=False
            ).first()
            if file_record is None:
                db.session.add(File(
                    filename=entry.name,
                    owner_id=owner_id,
                    parent_id=parent_id,
                    is_folder=False
                ))
                created += 1
    db.session.commit()
    return created


@click.command('sync-uploads')
@with_appcontext
def sync_uploads_command():
    """Scan instance/uploads and create missing File entries."""
    base_path = Path(current_app.config['UPLOAD_FOLDER'])
    if not base_path.exists():
        click.echo(f'Upload folder "{base_path}" not found.')
        return

    total_created = 0
    for entry in base_path.iterdir():
        if not entry.is_dir() or not entry.name.startswith('user_'):
            continue
        try:
            owner_id = int(entry.name.split('_', 1)[1])
        except (IndexError, ValueError):
            click.echo(f'Skipping folder "{entry.name}" (invalid name).')
            continue

        user = User.query.get(owner_id)
        if user is None:
            click.echo(f'Skipping folder "{entry.name}" (user {owner_id} not found).')
            continue

        click.echo(f'Synchronizing {entry} -> user {owner_id} ({user.username})')
        total_created += _sync_directory(entry, owner_id)

    click.echo(f'Synchronization complete. {total_created} entries created.')
