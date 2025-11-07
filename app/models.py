from app import db, login, pwd_context
from flask_login import UserMixin
from datetime import datetime

class Permission:
    VIEW = 1
    UPLOAD = 2
    CREATE = 4
    DELETE = 8
    ADMIN = 255

@login.user_loader
def load_user(id):
    return db.session.get(User, int(id))

class UserFilePermission(db.Model):
    __tablename__ = 'user_file_permissions'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), primary_key=True)
    can_read = db.Column(db.Boolean, default=False)
    can_write = db.Column(db.Boolean, default=False)

    user = db.relationship('User', back_populates='permissions')
    file = db.relationship('File', back_populates='permissions')


class Role(db.Model):
    __tablename__ = "roles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, index=True)
    default = db.Column(db.Boolean, default=False, index=True)
    permissions = db.Column(db.Integer)
    users = db.relationship('User', backref='role', lazy='dynamic')

    @staticmethod
    def insert_roles():
        roles = {
            'User': (Permission.VIEW | Permission.UPLOAD | Permission.CREATE, True),
            'Admin': (Permission.ADMIN, False)
        }
        for r in roles:
            role = Role.query.filter_by(name=r).first()
            if role is None:
                role = Role(name=r)
            role.permissions = roles[r][0]
            role.default = roles[r][1]
            db.session.add(role)
        db.session.commit()

class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True)
    password_hash = db.Column(db.String(128))
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'))
    files = db.relationship('File', backref='owner', lazy='dynamic')
    
    permissions = db.relationship('UserFilePermission', back_populates='user', lazy='dynamic')

    def __init__(self, **kwargs):
        super(User, self).__init__(**kwargs)
        if self.role is None:
            if self.username == 'admin':
                self.role = Role.query.filter_by(name='Admin').first()
            if self.role is None:
                self.role = Role.query.filter_by(default=True).first()

    def set_password(self, password):
        self.password_hash = pwd_context.hash(password)

    def check_password(self, password):
        return pwd_context.verify(password, self.password_hash)

    def can(self, permissions):
        return self.role is not None and (self.role.permissions & permissions) == permissions

    def is_admin(self):
        return self.can(Permission.ADMIN)

    @staticmethod
    def assign_admin_role():
        admin_role = Role.query.filter_by(name='Admin').first()
        first_user = User.query.first()
        if first_user and not first_user.is_admin():
            first_user.role = admin_role
            db.session.add(first_user)
            db.session.commit()

class File(db.Model):
    __tablename__ = 'files'
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    is_folder = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    children = db.relationship('File', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')

    permissions = db.relationship('UserFilePermission', back_populates='file', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'is_folder': self.is_folder,
            'created_at': self.created_at.isoformat() + 'Z',
            'parent_id': self.parent_id
        }

class SharedFile(db.Model):
    __tablename__ = 'shared_files'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), primary_key=True)
    permission = db.Column(db.Integer, nullable=False)
