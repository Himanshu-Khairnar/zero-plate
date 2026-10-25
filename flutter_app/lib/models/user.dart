enum Role { owner, manager, kitchenStaff, platformAdmin }

Role roleFromString(String s) => switch (s) {
      'OWNER' => Role.owner,
      'MANAGER' => Role.manager,
      'PLATFORM_ADMIN' => Role.platformAdmin,
      _ => Role.kitchenStaff,
    };

class User {
  final String id;
  final String name;
  final String email;
  final String roleName;

  /// null for platform admins.
  final String? organizationName;

  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.roleName,
    this.organizationName,
  });

  Role get role => roleFromString(roleName);

  /// OWNER and MANAGER may approve prep plans.
  bool get canApprove => role == Role.owner || role == Role.manager;

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        email: json['email'] as String,
        roleName: json['role'] as String,
        organizationName: json['organizationName'] as String?,
      );
}

class Outlet {
  final String id;
  final String name;

  const Outlet({required this.id, required this.name});

  factory Outlet.fromJson(Map<String, dynamic> json) =>
      Outlet(id: json['id'] as String, name: json['name'] as String);
}

/// Response of GET /api/mobile/me (and the login response minus the token).
class MeResponse {
  final User user;
  final List<Outlet> outlets;

  const MeResponse({required this.user, required this.outlets});

  factory MeResponse.fromJson(Map<String, dynamic> json) => MeResponse(
        user: User.fromJson(json['user'] as Map<String, dynamic>),
        outlets: (json['outlets'] as List)
            .map((e) => Outlet.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class LoginResponse extends MeResponse {
  final String token;

  const LoginResponse({required this.token, required super.user, required super.outlets});

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final me = MeResponse.fromJson(json);
    return LoginResponse(token: json['token'] as String, user: me.user, outlets: me.outlets);
  }
}
